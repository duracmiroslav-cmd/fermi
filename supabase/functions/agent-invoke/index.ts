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
import { findAgentById } from '../../../shared/agents.ts';
import { getKek } from '../../../shared/kek.ts';
import { DEFAULT_TEXT_MODEL } from '../../../shared/constants/models.ts';
import type { ChatMessage } from '../agent/openrouter.ts';
import { MAX_AGENT_STEPS, runAgentConversation } from '../agent/loop.ts';
import { buildToolset } from '../agent/tools/index.ts';
import { wrapSystemPrompt } from '../agent/prompt-guard.ts';
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
  const toolset = await buildToolset(capabilities, { admin, kek, ownerId: agent.ownerId });

  const systemPrompt = wrapSystemPrompt(
    agent.systemPrompt
    ?? `You are ${agent.name}, a helpful assistant on LINE. Reply in the user's language.`,
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
    return json({ text: result.text, hitStepCap: result.hitStepCap, steps: result.steps });
  } catch (err) {
    console.error('agent-invoke failed', err);
    // detail rides back to the Nitro server log (not the browser) so the
    // real upstream error (e.g. an OpenRouter status) is debuggable.
    return json({ error: 'invoke_failed', detail: String(err) }, 502);
  }
});
