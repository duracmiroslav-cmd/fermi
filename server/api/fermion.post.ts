// fermion chat. The owner converses with fermi's setup assistant to
// configure a resource (an agent's persona, a bot's settings) instead of
// editing fields by hand. Auth boundary + thin proxy: the loop +
// config-mutating tools run in the `fermion` Edge Function, which trusts
// the id it's handed — so ownership MUST be enforced here, per target
// type, before forwarding.

import { z } from 'zod';
import { getCurrentUser } from '~~/server/utils/auth';
import { checkOwnerPreviewRateLimit } from '~~/server/utils/rate-limit';
import { isTrustedTriggerHost } from '~~/server/utils/trigger';

// Maps a resource target type to the table whose `(id, owner_id)` proves
// ownership. Every entry must have `owner_id` + `deleted_at`; keep in step
// with the Edge Function's TARGETS registry. `account` is absent on
// purpose — it has no resource, it's scoped to the authenticated user.
const TARGET_TABLE = { agent: 'agents', bot: 'bots' } as const;

const bodySchema = z.object({
  targetType: z.enum(['account', 'agent', 'bot']),
  // Required for resource targets (agent / bot); ignored for `account`,
  // which the route binds to the authenticated user instead.
  targetId:   z.string().uuid().optional(),
  messages:   z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string().min(1).max(5000),
  })).min(1).max(50),
}).strict();

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }
  const { targetType, messages } = parsed.data;

  const admin = useSupabaseAdmin();

  // `account` is bound to the caller; resource targets are looked up and
  // ownership-checked here, since the Edge Function trusts the id it gets.
  let targetId: string;
  if (targetType === 'account') {
    targetId = user.id;
  } else {
    if (!parsed.data.targetId) {
      throw createError({ statusCode: 400, statusMessage: 'targetId is required for this target' });
    }
    const { data: resource, error: resourceErr } = await admin
      .from(TARGET_TABLE[targetType])
      .select('id')
      .eq('id', parsed.data.targetId)
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (resourceErr) throw resourceErr;
    if (!resource) {
      throw createError({
        statusCode:    404,
        statusMessage: 'Target not found',
        data:          { code: targetType === 'bot' ? '__errorBotNotFound' : '__errorAgentNotFound' },
      });
    }
    targetId = parsed.data.targetId;
  }

  const { upstashUrl, upstashToken, supabaseUrl, fermiInternalSecret } = useRuntimeConfig(event);

  const outcome = await checkOwnerPreviewRateLimit(
    admin,
    { upstashUrl: upstashUrl || null, upstashToken: upstashToken || null },
    { ownerId: user.id },
  );
  if (!outcome.allowed) {
    throw createError({
      statusCode:    429,
      statusMessage: `Fermion rate limit exceeded (${outcome.blockingScope ?? 'unknown'})`,
    });
  }

  const fermionUrl = new URL('/functions/v1/fermion', supabaseUrl);
  if (!isTrustedTriggerHost(fermionUrl)) {
    console.error('refusing to call fermion on untrusted host', fermionUrl.hostname);
    throw createError({ statusCode: 500, statusMessage: 'Misconfigured fermion host' });
  }

  const res = await fetch(fermionUrl, {
    method:  'POST',
    headers: {
      'Content-Type':            'application/json',
      // The function (deployed verify_jwt=false) authenticates us solely
      // by this secret (must match INTERNAL_SECRET_HEADER in
      // internal-auth.ts). No Supabase key in this call path.
      'x-fermi-internal-secret': fermiInternalSecret,
    },
    body: JSON.stringify({ targetType, targetId, messages }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error('fermion returned error', { status: res.status, detail: detail.slice(0, 200) });
    throw createError({ statusCode: 502, statusMessage: 'Fermion failed' });
  }

  return await res.json() as { text: string; hitStepCap: boolean; steps: unknown[]; changed: boolean };
});
