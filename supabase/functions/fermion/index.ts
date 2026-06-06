// fermion: one owner-scoped assistant. The owner talks to it and it
// connects bots, configures agents, and sets up providers via tools —
// each tool takes a resource id and scopes by the owner. Reuses the
// shared agent loop; same trust model as agent-invoke; stateless (the
// browser holds the chat history). Ownership is enforced inside each
// tool (see tool.ts), since the LLM may pass any id.
//
// The LLM key follows shared/keys.ts resolveKey: a Free owner runs on their
// own OpenRouter (BYOK) — fermion costs them, not the platform — and is
// refused if they haven't connected one; a Pro owner runs on the platform
// key (or their BYOK if present). The route gates the UI on the same rule.

import { createClient } from '@supabase/supabase-js';
import { getKek } from '../../../shared/kek.ts';
import { FreeBYOKRequiredError, PlatformKeyNotConfiguredError, resolveKey } from '../../../shared/keys.ts';
import { DEFAULT_TEXT_MODEL } from '../../../shared/constants/models.ts';
import type { ChatMessage } from '../agent/openrouter.ts';
import { MAX_AGENT_STEPS, runAgentConversation } from '../agent/loop.ts';
import { inspectInternalAuth } from '../agent/internal-auth.ts';
import { stripMarkdown } from '../agent/markdown.ts';
import { loadAccountState } from './state.ts';
import { type FermionContext, fermionSystemPrompt } from './prompt.ts';
import { FERMION_MUTATING_TOOLS, buildFermionToolset } from './toolset.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseSecretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const fermiKek = Deno.env.get('FERMI_KEK')!;
const PLATFORM_OPENROUTER_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? null;

const admin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface FermionRequest {
  // The authenticated owner (the route sets this from the session; the
  // Edge Function trusts it via the internal secret, as before).
  ownerId:  string;
  // The page the chat is embedded on, if any → "currently viewing X" hint.
  context?: FermionContext;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const auth = inspectInternalAuth(req);
  if (!auth.ok) {
    return json({ error: 'unauthorized', diag: { hasHeader: auth.hasHeader, hasSecret: auth.hasSecret } }, 401);
  }

  let payload: FermionRequest;
  try {
    payload = await req.json() as FermionRequest;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!payload.ownerId) return json({ error: 'missing_owner' }, 400);

  const kek = await getKek(fermiKek);

  // BYOK-first, platform fallback (Pro only). Resolve before any work so a
  // Free owner without OpenRouter is refused without spending anything.
  let openrouterKey: string;
  try {
    const resolved = await resolveKey(admin, kek, {
      ownerId:     payload.ownerId,
      purpose:     'openrouter',
      platformKey: PLATFORM_OPENROUTER_KEY,
    });
    openrouterKey = resolved.key;
  } catch (err) {
    if (err instanceof FreeBYOKRequiredError) return json({ error: 'free_byok_required' }, 403);
    if (err instanceof PlatformKeyNotConfiguredError) return json({ error: 'platform_key_missing' }, 503);
    throw err;
  }

  const state = await loadAccountState(admin, payload.ownerId);

  const messages: ChatMessage[] = [
    { role: 'system', content: fermionSystemPrompt(state, payload.context) },
    ...payload.messages.map(m => ({ role: m.role, content: m.content })),
  ];

  try {
    const result = await runAgentConversation({
      // fermion reasons on the platform default model regardless of which
      // (possibly cheap) model the owner's agents are configured to run.
      apiKey:        openrouterKey,
      model:         DEFAULT_TEXT_MODEL,
      fallbackModel: DEFAULT_TEXT_MODEL,
      messages,
      toolset:       buildFermionToolset(admin, payload.ownerId),
      // The fermion tools take ids + a bound ownerId; they ignore ctx. A
      // real ToolContext is supplied only to satisfy the loop's shape.
      toolContextBase: {
        admin,
        kek,
        ownerId:           payload.ownerId,
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
    const changed = result.steps.some(
      s => s.type === 'tool_called' && FERMION_MUTATING_TOOLS.includes(String(s.payload.name)),
    );
    // Flatten markdown to plain text, same as the LINE worker: the chat
    // renders replies as raw text, so the prompt's "no Markdown" rule is
    // belt; this is suspenders for when the model slips a **bold** through.
    return json({ text: stripMarkdown(result.text), hitStepCap: result.hitStepCap, steps: result.steps, changed });
  } catch (err) {
    console.error('fermion failed', err);
    return json({ error: 'build_failed', detail: String(err) }, 502);
  }
});
