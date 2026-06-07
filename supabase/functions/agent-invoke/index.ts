// Synchronous, stateless agent invocation: messages in → reply + step
// trace out. The dashboard test chat is its first caller; the same
// primitive is what a future developer API would expose (behind a
// different, API-key front door). It deliberately does NOT persist to
// threads / messages / agent_runs and does NOT touch LINE — the caller
// owns conversation state.
//
// Trust model mirrors the rest of the system: fermi's Nitro layer
// authenticates the user and verifies agent ownership, then calls this
// with a shared internal secret (see internal-auth.ts). We re-check it
// as defense in depth and derive the owner from the agent row (never
// trust a caller-supplied owner id).

import { createClient } from '@supabase/supabase-js';
import { loadActiveCapabilities } from '../../../shared/agentCapabilities.ts';
import { effectiveAgentMode, findAgentById } from '../../../shared/agents.ts';
import { getKek } from '../../../shared/kek.ts';
import { DEFAULT_TEXT_MODEL } from '../../../shared/constants/models.ts';
import type { ChatMessage } from '../agent/openrouter.ts';
import { MAX_AGENT_STEPS, runAgentConversation } from '../agent/loop.ts';
import { normalizeReplyText } from '../agent/reply-text.ts';
import { buildToolset, mergeToolsets } from '../agent/tools/index.ts';
import { buildModeToolset } from '../agent/tools/management/mode.ts';
import { MANAGEMENT_MUTATING_TOOLS, buildManagementToolset } from '../agent/tools/management/toolset.ts';
import { buildDebugToolset, debugPreamble } from '../agent/tools/management/debug.ts';
import { maintenancePreamble } from '../agent/tools/management/prompt.ts';
import { loadAccountState } from '../agent/tools/management/state.ts';
import { defaultSystemPrompt, wrapSystemPrompt } from '../agent/prompt-guard.ts';
import { inspectInternalAuth } from '../agent/internal-auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseSecretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const fermiKek = Deno.env.get('FERMI_KEK')!;
// The LLM call is a config-time try-out (the owner evaluating their bot
// in the dashboard, not serving an end user), so it runs on the
// platform key — letting owners test before connecting their own
// OpenRouter. Tools inside the loop still resolve BYOK-first via their
// own resolveKey, so a tool only works if its key is connected.
const PLATFORM_OPENROUTER_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? null;

const admin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface InvokeRequest {
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
    console.error('agent-invoke: OPENROUTER_API_KEY not configured');
    return json({ error: 'platform_key_missing' }, 503);
  }

  let payload: InvokeRequest;
  try {
    payload = await req.json() as InvokeRequest;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const agent = await findAgentById(admin, payload.agentId);
  if (!agent) return json({ error: 'agent_not_found' }, 404);

  const kek = await getKek(fermiKek);
  const capabilities = await loadActiveCapabilities(admin, agent.id);
  const capabilityToolset = await buildToolset(capabilities, { admin, kek, ownerId: agent.ownerId });

  // The Nitro route verified the caller owns this agent, so on this endpoint
  // the owner is provably the master: switch_mode is always available, and the
  // heavier management / debug overlays follow the agent's current mode. An
  // end-user never reaches this path — only the LINE worker serves them, where
  // master identity is the imprinted LINE id (P5).
  const mode = effectiveAgentMode(agent);
  const overlays = [buildModeToolset({ admin, ownerId: agent.ownerId, agentId: agent.id })];
  let preamble = '';
  if (mode === 'maintenance') {
    const state = await loadAccountState(admin, agent.ownerId);
    overlays.push(buildManagementToolset(admin, agent.ownerId, { channel: 'web' }));
    preamble = `\n\n${maintenancePreamble(state, { agentId: agent.id })}`;
  } else if (mode === 'debug') {
    // Default debug scope is the agent's bound bot; a fresh agent may have
    // none, and the debug tools fall back to filtering by agent id.
    const { data: botRow, error: botErr } = await admin
      .from('bots')
      .select('id')
      .eq('agent_id', agent.id)
      .eq('owner_id', agent.ownerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (botErr) console.warn('agent-invoke: bound-bot lookup failed; debugging by agent', botErr);
    overlays.push(buildDebugToolset({ admin, ownerId: agent.ownerId, botId: botRow?.id ?? null, agentId: agent.id }));
    preamble = `\n\n${debugPreamble()}`;
  }
  const toolset = mergeToolsets(capabilityToolset, ...overlays);

  const systemPrompt = wrapSystemPrompt(
    `${agent.systemPrompt ?? defaultSystemPrompt(agent.name)}${preamble}`,
    { hasTools: toolset.schemas.length > 0 },
  );
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...payload.messages.map(m => ({ role: m.role, content: m.content })),
  ];

  try {
    const result = await runAgentConversation({
      apiKey:        PLATFORM_OPENROUTER_KEY,
      model:         agent.defaultTextModel ?? DEFAULT_TEXT_MODEL,
      fallbackModel: DEFAULT_TEXT_MODEL,
      messages,
      toolset,
      // Stateless: ephemeral ids give media-producing tools a storage
      // path to write under; nothing links back to a real thread/run.
      // Tools that persist against a real bot/thread/user (e.g.
      // reminders) hit their not-null FK and fail gracefully here —
      // correct, since the test chat has no live transport to fire on.
      toolContextBase: {
        admin,
        kek,
        ownerId:        agent.ownerId,
        agentId:        agent.id,
        threadId:       crypto.randomUUID(),
        botId:          crypto.randomUUID(),
        externalUserId: crypto.randomUUID(),
        subjectType:    'user',
        subjectExternalId: crypto.randomUUID(),
        runId:          crypto.randomUUID(),
        attachments:    [],
      },
      maxSteps: MAX_AGENT_STEPS,
    });
    // Run the reply through the same pass the LINE worker uses so the
    // test chat previews exactly what an end user would receive.
    const text = normalizeReplyText(result.text, { traditional: agent.normalizeTraditional });
    // Signals the dashboard to refetch: a mutating management tool or a mode
    // switch changed server state the UI mirrors (config, connectors, mode).
    const changed = result.steps.some(
      s => s.type === 'tool_called'
        && (String(s.payload.name) === 'switch_mode' || MANAGEMENT_MUTATING_TOOLS.includes(String(s.payload.name))),
    );
    return json({ text, hitStepCap: result.hitStepCap, steps: result.steps, changed });
  } catch (err) {
    console.error('agent-invoke failed', err);
    // detail rides back to the Nitro server log (not the browser) so the
    // real upstream error (e.g. an OpenRouter status) is debuggable.
    return json({ error: 'invoke_failed', detail: String(err) }, 502);
  }
});
