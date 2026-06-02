// Dashboard test chat. The owner talks to their agent from the agent
// editor to see how it actually behaves before pointing a LINE bot at
// it. Stateless: the browser holds the conversation and posts the full
// message list each turn; nothing is persisted.
//
// This endpoint is the auth boundary (verifies the caller owns the
// agent) and a thin proxy: the agent loop itself runs in the
// `agent-invoke` Edge Function, where the loop primitives live. Same
// platform-key try-out rules as preview-tts — see backend.md.

import { z } from 'zod';
import { getCurrentUser } from '~~/server/utils/auth';
import { checkOwnerPreviewRateLimit } from '~~/server/utils/rate-limit';
import { isTrustedTriggerHost } from '~~/server/utils/trigger';

// Caps keep a single test turn bounded: LINE tops out at 5000 chars per
// message, and a test conversation longer than this is well past the
// point of useful iteration.
const bodySchema = z.object({
  messages: z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string().min(1).max(5000),
  })).min(1).max(50),
}).strict();

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);
  const id = getUuidParam(event, 'id');

  const admin = useSupabaseAdmin();

  // Ownership check IS the authorization: only the agent's owner can
  // test it. A miss is a 404 (don't reveal others' agent ids exist).
  const { data: agent, error: agentErr } = await admin
    .from('agents')
    .select('id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (agentErr) throw agentErr;
  if (!agent) {
    throw createError({
      statusCode:    404,
      statusMessage: 'Agent not found',
      data:          { code: '__errorAgentNotFound' },
    });
  }

  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }

  const { upstashUrl, upstashToken, supabaseUrl, supabaseServiceRoleKey } = useRuntimeConfig(event);

  const outcome = await checkOwnerPreviewRateLimit(
    admin,
    { upstashUrl: upstashUrl || null, upstashToken: upstashToken || null },
    { ownerId: user.id },
  );
  if (!outcome.allowed) {
    throw createError({
      statusCode:    429,
      statusMessage: `Test chat rate limit exceeded (${outcome.blockingScope ?? 'unknown'})`,
    });
  }

  const invokeUrl = new URL('/functions/v1/agent-invoke', supabaseUrl);
  if (!isTrustedTriggerHost(invokeUrl)) {
    console.error('refusing to call agent-invoke on untrusted host', invokeUrl.hostname);
    throw createError({ statusCode: 500, statusMessage: 'Misconfigured invoke host' });
  }

  const res = await fetch(invokeUrl, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${supabaseServiceRoleKey}`,
    },
    body: JSON.stringify({ agentId: id, messages: parsed.data.messages }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error('agent-invoke returned error', { status: res.status, detail: detail.slice(0, 200) });
    throw createError({ statusCode: 502, statusMessage: 'Agent invocation failed' });
  }

  return await res.json() as { text: string; hitStepCap: boolean; steps: unknown[] };
});
