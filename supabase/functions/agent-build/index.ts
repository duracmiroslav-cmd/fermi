// The builder conversation: the owner talks to fermi's setup assistant,
// which edits the target agent's config (name / system prompt /
// capabilities) via tools. Reuses the shared agent loop with a builder
// toolset. Same trust model + platform-key try-out rules as
// agent-invoke; stateless (the browser holds the builder chat history),
// but the tools have side effects on the bound agent.

import { createClient } from '@supabase/supabase-js';
import { loadActiveCapabilities } from '../../../shared/agentCapabilities.ts';
import { findAgentById } from '../../../shared/agents.ts';
import { getKek } from '../../../shared/kek.ts';
import { DEFAULT_TEXT_MODEL } from '../../../shared/constants/models.ts';
import type { ChatMessage } from '../agent/openrouter.ts';
import { MAX_AGENT_STEPS, runAgentConversation } from '../agent/loop.ts';
import { buildBuilderToolset, builderSystemPrompt } from './builder.ts';
import { inspectInternalAuth } from '../agent/internal-auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const fermiKek = Deno.env.get('FERMI_KEK')!;
const PLATFORM_OPENROUTER_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? null;

const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface BuildRequest {
  agentId:  string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const auth = inspectInternalAuth(req);
  if (!auth.ok) {
    return json({ error: 'unauthorized', diag: { hasHeader: auth.hasHeader, hasSecret: auth.hasSecret } }, 401);
  }
  if (!PLATFORM_OPENROUTER_KEY) {
    console.error('agent-build: OPENROUTER_API_KEY not configured');
    return json({ error: 'platform_key_missing' }, 503);
  }

  let payload: BuildRequest;
  try {
    payload = await req.json() as BuildRequest;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const agent = await findAgentById(admin, payload.agentId);
  if (!agent) return json({ error: 'agent_not_found' }, 404);

  const kek = await getKek(fermiKek);
  const toolset = buildBuilderToolset(admin, agent.ownerId, agent.id);

  // Inject the agent's current config so the builder edits in place
  // (revise the existing prompt, keep capabilities it isn't changing)
  // rather than starting blind on every turn.
  const capabilities = await loadActiveCapabilities(admin, agent.id);
  const systemPrompt = builderSystemPrompt({
    name:            agent.name,
    systemPrompt:    agent.systemPrompt,
    capabilitySlugs: capabilities.map(c => c.slug),
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...payload.messages.map(m => ({ role: m.role, content: m.content })),
  ];

  try {
    const result = await runAgentConversation({
      // Builder uses the platform default model for its own reasoning —
      // it must write good prompts regardless of which (possibly cheap)
      // model the target agent is configured to run on.
      apiKey:        PLATFORM_OPENROUTER_KEY,
      model:         DEFAULT_TEXT_MODEL,
      fallbackModel: DEFAULT_TEXT_MODEL,
      messages,
      toolset,
      // The builder toolset ignores ctx; it operates on the bound agent.
      // A real ToolContext is supplied only to satisfy the loop's shape.
      toolContextBase: {
        admin,
        kek,
        ownerId:     agent.ownerId,
        threadId:    crypto.randomUUID(),
        runId:       crypto.randomUUID(),
        attachments: [],
      },
      maxSteps: MAX_AGENT_STEPS,
    });
    // `changed` lets the dashboard refetch the agent only when a tool
    // actually mutated it, rather than on every conversational turn.
    const changed = result.steps.some(
      s => s.type === 'tool_called'
        && (s.payload.name === 'update_agent' || s.payload.name === 'set_capabilities'),
    );
    return json({ text: result.text, hitStepCap: result.hitStepCap, steps: result.steps, changed });
  } catch (err) {
    console.error('agent-build failed', err);
    // detail rides back to the Nitro server log (not the browser) so the
    // real upstream error (e.g. an OpenRouter status) is debuggable.
    return json({ error: 'build_failed', detail: String(err) }, 502);
  }
});
