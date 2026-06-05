// fermion: the owner talks to fermi's setup assistant, which edits the
// target resource's config (an agent's persona, a bot's settings, …) via
// tools. Target-agnostic — the per-surface logic lives in a registry
// entry (registry.ts). Reuses the shared agent loop; same trust model +
// platform-key try-out rules as agent-invoke; stateless (the browser
// holds the chat history), but the tools have side effects on the bound
// resource.

import { createClient } from '@supabase/supabase-js';
import { getKek } from '../../../shared/kek.ts';
import { DEFAULT_TEXT_MODEL } from '../../../shared/constants/models.ts';
import type { ChatMessage } from '../agent/openrouter.ts';
import { MAX_AGENT_STEPS, runAgentConversation } from '../agent/loop.ts';
import { TARGETS } from './registry.ts';
import { inspectInternalAuth } from '../agent/internal-auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseSecretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const fermiKek = Deno.env.get('FERMI_KEK')!;
const PLATFORM_OPENROUTER_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? null;

const admin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface FermionRequest {
  targetType: string;
  targetId:   string;
  messages:   Array<{ role: 'user' | 'assistant'; content: string }>;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const auth = inspectInternalAuth(req);
  if (!auth.ok) {
    return json({ error: 'unauthorized', diag: { hasHeader: auth.hasHeader, hasSecret: auth.hasSecret } }, 401);
  }
  if (!PLATFORM_OPENROUTER_KEY) {
    console.error('fermion: OPENROUTER_API_KEY not configured');
    return json({ error: 'platform_key_missing' }, 503);
  }

  let payload: FermionRequest;
  try {
    payload = await req.json() as FermionRequest;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const target = TARGETS[payload.targetType];
  if (!target) return json({ error: 'unknown_target' }, 400);

  const resolved = await target.resolve(admin, payload.targetId);
  if (!resolved) return json({ error: 'target_not_found' }, 404);

  const kek = await getKek(fermiKek);

  const messages: ChatMessage[] = [
    { role: 'system', content: resolved.systemPrompt },
    ...payload.messages.map(m => ({ role: m.role, content: m.content })),
  ];

  try {
    const result = await runAgentConversation({
      // fermion uses the platform default model for its own reasoning —
      // it must write good config regardless of which (possibly cheap)
      // model the target resource is configured to run on.
      apiKey:        PLATFORM_OPENROUTER_KEY,
      model:         DEFAULT_TEXT_MODEL,
      fallbackModel: DEFAULT_TEXT_MODEL,
      messages,
      toolset:       resolved.toolset,
      // The target toolsets ignore ctx; they operate on the bound
      // resource. A real ToolContext is supplied only to satisfy the
      // loop's shape; ownerId is the one field that reflects the target.
      toolContextBase: {
        admin,
        kek,
        ownerId:           resolved.ownerId,
        agentId:           crypto.randomUUID(),
        threadId:          crypto.randomUUID(),
        botId:             crypto.randomUUID(),
        externalUserId:    crypto.randomUUID(),
        subjectType:       'user',
        subjectExternalId: crypto.randomUUID(),
        runId:             crypto.randomUUID(),
        attachments:       [],
      },
      maxSteps: MAX_AGENT_STEPS,
    });
    // `changed` lets the dashboard refetch the resource only when a tool
    // actually mutated it, rather than on every conversational turn.
    const changed = result.steps.some(
      s => s.type === 'tool_called' && target.mutatingTools.includes(String(s.payload.name)),
    );
    return json({ text: result.text, hitStepCap: result.hitStepCap, steps: result.steps, changed });
  } catch (err) {
    console.error('fermion failed', err);
    // detail rides back to the Nitro server log (not the browser) so the
    // real upstream error (e.g. an OpenRouter status) is debuggable.
    return json({ error: 'build_failed', detail: String(err) }, 502);
  }
});
