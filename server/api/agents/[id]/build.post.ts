// The builder chat. The owner converses with fermi's setup assistant to
// configure this agent (name / system prompt / capabilities) instead of
// editing fields by hand. Auth boundary + thin proxy, mirroring the
// test-chat invoke endpoint; the loop + config-mutating tools run in the
// `agent-build` Edge Function.

import { z } from 'zod';
import { getCurrentUser } from '~~/server/utils/auth';
import { checkOwnerPreviewRateLimit } from '~~/server/utils/rate-limit';
import { isTrustedTriggerHost } from '~~/server/utils/trigger';

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
      statusMessage: `Builder rate limit exceeded (${outcome.blockingScope ?? 'unknown'})`,
    });
  }

  const buildUrl = new URL('/functions/v1/agent-build', supabaseUrl);
  if (!isTrustedTriggerHost(buildUrl)) {
    console.error('refusing to call agent-build on untrusted host', buildUrl.hostname);
    throw createError({ statusCode: 500, statusMessage: 'Misconfigured builder host' });
  }

  const res = await fetch(buildUrl, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${supabaseServiceRoleKey}`,
    },
    body: JSON.stringify({ agentId: id, messages: parsed.data.messages }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error('agent-build returned error', { status: res.status, detail: detail.slice(0, 200) });
    throw createError({ statusCode: 502, statusMessage: 'Builder failed' });
  }

  return await res.json() as { text: string; hitStepCap: boolean; steps: unknown[]; changed: boolean };
});
