// The agent reasoning loop, extracted so both callers share one
// behavior: the LINE worker (around it: thread persistence, LINE
// delivery, quota) and the synchronous invoke endpoint (around it:
// nothing — stateless request/response). Anything LINE- or
// persistence-specific stays in the caller and reaches the loop only
// through the `onStep` / `beforeIteration` hooks, so this stays a pure
// "messages + tools → reply" engine with no I/O of its own beyond the
// LLM and tool calls it's handed.

import { OpenRouterError, completeChat, type ChatMessage } from './openrouter.ts';
import type { ToolContext, Toolset } from './tools/index.ts';

// Hard cap on LLM iterations per run. A typical multi-step query
// (read calendar → search docs → answer) finishes in 3-5; 8 leaves
// headroom without risking the Edge Function's 400s wall clock when
// tools are slow.
export const MAX_AGENT_STEPS = 8;

// Subset of agent_run_steps' StepType the loop itself emits. The worker
// maps these onto logStep; the invoke endpoint collects them for the
// response. Past-verb form matches the DB convention.
export type ConversationStepType
  = | 'llm_requested'
    | 'llm_responded'
    | 'tool_called'
    | 'tool_responded';

export interface ConversationStep {
  type:             ConversationStepType;
  payload:          Record<string, unknown>;
  latencyMs?:       number;
  costUsd?:         number;
  openrouterGenId?: string;
}

export interface ConversationResult {
  // The model's final text. Empty string when the loop hit the step
  // cap with no terminal turn — `hitStepCap` distinguishes that from a
  // genuinely empty reply so the caller can word its own notice.
  text:         string;
  steps:        ConversationStep[];
  totalCostUsd: number;
  hitStepCap:   boolean;
}

export interface RunConversationParams {
  apiKey:        string;
  // Mutable within a run: a 404 (retired model) rebinds to fallbackModel
  // and carries forward so later iterations don't re-pay the 4xx.
  model:         string;
  fallbackModel: string;
  // System prompt + history + the new user turn, already assembled by
  // the caller (it owns prompt wrapping, history shape, vision routing).
  messages:      ChatMessage[];
  toolset:       Toolset;
  // Everything a tool needs except the per-call id, which the loop fills.
  toolContextBase: Omit<ToolContext, 'toolCallId'>;
  maxSteps:      number;
  // Called as each step happens, in order. The worker persists to
  // agent_run_steps; the invoke endpoint pushes into an array.
  onStep?:       (step: ConversationStep) => void | Promise<void>;
  // Run before each LLM iteration. Returning an abort ends the loop with
  // the given text as the final reply (the worker uses this for the
  // extended-run quota gate). Returning null continues.
  beforeIteration?: (iteration: number) => Promise<{ abort: true; text: string } | null>;
}

export const runAgentConversation = async (
  params: RunConversationParams,
): Promise<ConversationResult> => {
  const { apiKey, fallbackModel, messages, toolset, toolContextBase, maxSteps } = params;
  let model = params.model;

  const steps: ConversationStep[] = [];
  const emit = async (step: ConversationStep): Promise<void> => {
    steps.push(step);
    await params.onStep?.(step);
  };

  let totalCostUsd = 0;
  let finalText: string | null = null;
  let iteration = 0;

  while (iteration < maxSteps) {
    iteration++;

    if (params.beforeIteration) {
      const gate = await params.beforeIteration(iteration);
      if (gate?.abort) {
        finalText = gate.text;
        break;
      }
    }

    await emit({
      type:    'llm_requested',
      payload: { model, message_count: messages.length, iteration },
    });

    const llmStart = performance.now();
    let result;
    try {
      result = await completeChat({ apiKey, model, messages, tools: toolset.schemas });
    } catch (err) {
      // OpenRouter 404 on a chat completion almost always means the
      // model id retired (the endpoint is fixed every call, so
      // path-not-found is structurally impossible). Retry once with the
      // fermi default, then carry it forward. Same-id guard: if the
      // default itself 404s, let the error up.
      if (err instanceof OpenRouterError && err.status === 404 && model !== fallbackModel) {
        console.warn('Model retired, retrying with default', { originalModel: model, fallbackModel });
        model = fallbackModel;
        result = await completeChat({ apiKey, model, messages, tools: toolset.schemas });
      } else {
        throw err;
      }
    }
    const llmLatency = Math.round(performance.now() - llmStart);
    totalCostUsd += result.costUsd;

    await emit({
      type:    'llm_responded',
      payload: {
        model:          result.model,
        finish_reason:  result.finishReason,
        usage:          result.usage,
        has_tool_calls: result.toolCalls !== null,
      },
      latencyMs:       llmLatency,
      costUsd:         result.costUsd,
      openrouterGenId: result.generationId,
    });

    if (!result.toolCalls) {
      finalText = result.text ?? '';
      break;
    }

    // Re-attach the assistant turn (including tool_calls) so the next
    // iteration sees the exchange. OpenAI's format requires each tool
    // message to immediately follow the assistant turn that requested it.
    messages.push({
      role:    'assistant',
      content: result.text,
      tool_calls: result.toolCalls.map(tc => ({
        id:       tc.id,
        type:     'function',
        function: { name: tc.name, arguments: tc.argumentsJson },
      })),
    });

    for (const call of result.toolCalls) {
      await emit({
        type:    'tool_called',
        payload: { tool_call_id: call.id, name: call.name, arguments: call.argumentsJson },
      });

      const toolStart = performance.now();
      const toolResult = await toolset.execute(call.name, call.argumentsJson, {
        ...toolContextBase,
        toolCallId: call.id,
      });
      const toolLatency = Math.round(performance.now() - toolStart);

      await emit({
        type:    'tool_responded',
        payload: {
          tool_call_id: call.id,
          name:         call.name,
          // Truncated preview keeps payload row size sane; the full
          // result still flows back to the model via the tool turn.
          result_preview: toolResult.slice(0, 500),
        },
        latencyMs: toolLatency,
      });

      messages.push({ role: 'tool', tool_call_id: call.id, content: toolResult });
    }
  }

  return {
    text:         finalText ?? '',
    steps,
    totalCostUsd,
    hitStepCap:   finalText === null,
  };
};
