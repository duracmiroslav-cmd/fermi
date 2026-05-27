import { z } from 'zod';
import { getCurrentUser } from '~~/server/utils/auth';
import { storeCredential } from '~~/shared/credentials';
import { getKek } from '~~/shared/kek';

const bodySchema = z.object({
  token: z.string().trim().min(20),
});

// Confirm the token is real and capture the account login before storing.
// GET /user works for both classic and fine-grained PATs and spends no
// quota. Doing it here means a typo'd token fails at connect time rather
// than silently surfacing as tool errors much later.
const verifyGithubToken = async (token: string): Promise<string> => {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'fermi',
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid GitHub token' });
  }
  if (!res.ok) {
    throw createError({ statusCode: 400, statusMessage: `GitHub verification failed (${res.status})` });
  }
  const data = await res.json() as { login?: string };
  return data.login ?? 'unknown';
};

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);
  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'token is required' });
  }
  const { token } = parsed.data;

  const login = await verifyGithubToken(token);

  const { fermiKek } = useRuntimeConfig(event);
  const kek = await getKek(fermiKek);
  const admin = useSupabaseAdmin();

  // Idempotent connect: drop any existing row so re-paste of a rotated
  // token replaces cleanly past the partial unique index on
  // (user_id, key_type) WHERE bot_id IS NULL.
  const { error: removeErr } = await admin
    .from('encrypted_credentials')
    .delete()
    .eq('user_id', user.id)
    .eq('key_type', 'github')
    .is('bot_id', null);
  if (removeErr) throw removeErr;

  const maskedKey = `${token.slice(0, 8)}...${token.slice(-4)}`;

  await storeCredential(admin, kek, {
    userId: user.id,
    botId: null,
    keyType: 'github',
    plaintext: token,
    metadata: { masked_key: maskedKey, github_login: login },
  });

  return { ok: true as const, login };
});
