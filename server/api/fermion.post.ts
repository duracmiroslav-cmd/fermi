// fermion chat. The owner converses with fermi's one assistant to connect
// bots, configure agents, and set up providers. Auth boundary + thin
// proxy: the loop + tools run in the `fermion` Edge Function (owner-scoped;
// each tool enforces ownership by id). This route authenticates the owner,
// validates the optional page-context ids belong to them, and forwards.

import { z } from 'zod';
import { getCurrentUser } from '~~/server/utils/auth';
import { checkOwnerPreviewRateLimit } from '~~/server/utils/rate-limit';
import { isTrustedTriggerHost } from '~~/server/utils/trigger';

const bodySchema = z.object({
  // The page the chat is embedded on, if any → "currently viewing X" hint.
  context: z.object({
    agentId: z.string().uuid().optional(),
    botId:   z.string().uuid().optional(),
  }).strict().optional(),
  messages: z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string().min(1).max(5000),
  })).min(1).max(50),
}).strict();

// Confirms a context id belongs to the caller before it reaches the prompt;
// a foreign id is dropped (not an error) so a stale hint never leaks names.
const ownedId = async (
  admin: ReturnType<typeof useSupabaseAdmin>,
  table: 'agents' | 'bots',
  id: string | undefined,
  ownerId: string,
): Promise<string | undefined> => {
  if (!id) return undefined;
  const { data, error } = await admin
    .from(table).select('id').eq('id', id).eq('owner_id', ownerId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data ? id : undefined;
};

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }
  const { context, messages } = parsed.data;

  const admin = useSupabaseAdmin();

  const validatedContext = context
    ? {
        agentId: await ownedId(admin, 'agents', context.agentId, user.id),
        botId:   await ownedId(admin, 'bots', context.botId, user.id),
      }
    : undefined;

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
    body: JSON.stringify({ ownerId: user.id, context: validatedContext, messages }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error('fermion returned error', { status: res.status, detail: detail.slice(0, 200) });
    throw createError({ statusCode: 502, statusMessage: 'Fermion failed' });
  }

  return await res.json() as { text: string; hitStepCap: boolean; steps: unknown[]; changed: boolean };
});
