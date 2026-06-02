import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAgentConversation } from '../../supabase/functions/agent/loop';
import type { Toolset } from '../../supabase/functions/agent/tools/index';

// Fakes OpenRouter at the fetch boundary (completeChat is imported, not
// injected) so the extracted loop is tested against the real request/
// response parsing. Each enqueued reply is one chat completion.

interface FakeReply {
  status?:    number; // non-2xx → completeChat throws OpenRouterError
  content?:   string | null;
  toolCalls?: Array<{ id: string; name: string; args: string }>;
}

const sentBodies: Array<Record<string, unknown>> = [];

const stubOpenRouter = (replies: FakeReply[]): void => {
  const queue = [...replies];
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    sentBodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
    const reply = queue.shift() ?? { content: 'fallback' };
    if (reply.status && reply.status >= 400) {
      return Promise.resolve({ ok: false, status: reply.status, text: () => Promise.resolve('boom') });
    }
    return Promise.resolve({
      ok:   true,
      json: () => Promise.resolve({
        id:      'gen_1',
        model:   'test-model',
        choices: [{
          message: {
            role:       'assistant',
            content:    reply.content ?? null,
            tool_calls: reply.toolCalls?.map(tc => ({
              id:       tc.id,
              type:     'function',
              function: { name: tc.name, arguments: tc.args },
            })),
          },
          finish_reason: reply.toolCalls ? 'tool_calls' : 'stop',
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0.001 },
      }),
    });
  });
};

const toolset = (execute = () => Promise.resolve('{"ok":true}')): Toolset => ({
  schemas: [],
  execute,
} as unknown as Toolset);

const base = {
  apiKey:          'k',
  model:           'agent-model',
  fallbackModel:   'fallback-model',
  toolContextBase: {} as never,
  maxSteps:        8,
};

afterEach(() => {
  vi.unstubAllGlobals();
  sentBodies.length = 0;
});

describe('runAgentConversation', () => {
  it('returns the text and stops when the model emits no tool calls', async () => {
    stubOpenRouter([{ content: 'hello' }]);
    const res = await runAgentConversation({ ...base, messages: [{ role: 'user', content: 'hi' }], toolset: toolset() });
    expect(res.text).toBe('hello');
    expect(res.hitStepCap).toBe(false);
    expect(res.steps.map(s => s.type)).toEqual(['llm_requested', 'llm_responded']);
  });

  it('executes a tool call then continues to the final answer', async () => {
    stubOpenRouter([
      { toolCalls: [{ id: 'c1', name: 'search', args: '{}' }] },
      { content: 'answer' },
    ]);
    const execute = vi.fn(() => Promise.resolve('{"result":42}'));
    const res = await runAgentConversation({ ...base, messages: [{ role: 'user', content: 'q' }], toolset: toolset(execute) });
    expect(execute).toHaveBeenCalledOnce();
    expect(res.text).toBe('answer');
    expect(res.steps.map(s => s.type)).toEqual([
      'llm_requested', 'llm_responded', 'tool_called', 'tool_responded',
      'llm_requested', 'llm_responded',
    ]);
  });

  it('flags hitStepCap when the model never stops calling tools', async () => {
    stubOpenRouter([
      { toolCalls: [{ id: 'c1', name: 's', args: '{}' }] },
      { toolCalls: [{ id: 'c2', name: 's', args: '{}' }] },
    ]);
    const res = await runAgentConversation({ ...base, maxSteps: 2, messages: [{ role: 'user', content: 'q' }], toolset: toolset() });
    expect(res.hitStepCap).toBe(true);
    expect(res.text).toBe('');
  });

  it('aborts before the LLM call when beforeIteration returns abort', async () => {
    stubOpenRouter([{ content: 'should not be reached' }]);
    const res = await runAgentConversation({
      ...base,
      messages:        [{ role: 'user', content: 'q' }],
      toolset:         toolset(),
      beforeIteration: () => Promise.resolve({ abort: true as const, text: 'quota gate' }),
    });
    expect(res.text).toBe('quota gate');
    expect(res.steps).toHaveLength(0);
    expect(sentBodies).toHaveLength(0);
  });

  it('retries a retired (404) model on the fallback, carrying it forward', async () => {
    stubOpenRouter([
      { status: 404 },
      { content: 'recovered' },
    ]);
    const res = await runAgentConversation({ ...base, messages: [{ role: 'user', content: 'q' }], toolset: toolset() });
    expect(res.text).toBe('recovered');
    expect(sentBodies[0].model).toBe('agent-model');
    expect(sentBodies[1].model).toBe('fallback-model');
  });
});
