import { z } from 'zod';
import { getCurrentUser } from '~~/server/utils/auth';
import { storeCredential } from '~~/shared/credentials';
import { getKek } from '~~/shared/kek';

const bodySchema = z.object({
  apiKey: z.string().trim().min(10),
});

// One free-tier Tavily query is spent here to confirm the key is
// real before we encrypt and store it. Skipping verification would
// let typos sit in the DB and surface as web_search errors much
// later, far from where the user pasted the key.
const verifyTavilyKey = async (apiKey: string): Promise<void> => {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: 'ping',
      max_results: 1,
      search_depth: 'basic',
    }),
  });
  if (res.ok) return;
  throw createError({
    statusCode: res.status === 401 || res.status === 403 ? 401 : 400,
    statusMessage: res.status === 401 || res.status === 403
      ? 'Invalid Tavily API key'
      : `Tavily verification failed (${res.status})`,
  });
};

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);
  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'apiKey is required' });
  }
  const { apiKey } = parsed.data;

  await verifyTavilyKey(apiKey);

  const { fermiKek } = useRuntimeConfig(event);
  const kek = await getKek(fermiKek);
  const admin = useSupabaseAdmin();

  // Idempotent connect: drop any existing row first so re-paste of a
  // rotated key replaces cleanly. The partial unique index on
  // (user_id, key_type) WHERE bot_id IS NULL would otherwise 23505.
  const { error: removeErr } = await admin
    .from('encrypted_credentials')
    .delete()
    .eq('user_id', user.id)
    .eq('key_type', 'tavily')
    .is('bot_id', null);
  if (removeErr) throw removeErr;

  await storeCredential(admin, kek, {
    userId: user.id,
    botId: null,
    keyType: 'tavily',
    plaintext: apiKey,
  });

  return { ok: true as const };
});
