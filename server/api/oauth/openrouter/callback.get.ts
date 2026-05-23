import { serverSupabaseUser } from '#supabase/server';
import { clearPkceCookie, readPkceCookie } from '~~/server/utils/oauth/cookies';
import { exchangeCodeForKey } from '~~/server/utils/oauth/openrouter';
import { storeCredential } from '~~/shared/credentials';
import { getKek } from '~~/shared/kek';

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const query = getQuery(event);
  const error = typeof query.error === 'string' ? query.error : null;
  if (error) {
    clearPkceCookie(event);
    return sendRedirect(event, `/dashboard?openrouter=error&reason=${encodeURIComponent(error)}`, 302);
  }

  const code = typeof query.code === 'string' ? query.code : null;
  const state = typeof query.state === 'string' ? query.state : null;
  if (!code || !state) {
    clearPkceCookie(event);
    return sendRedirect(event, '/dashboard?openrouter=error&reason=missing_params', 302);
  }

  const cookie = readPkceCookie(event);
  if (!cookie) {
    return sendRedirect(event, '/dashboard?openrouter=error&reason=expired_session', 302);
  }
  if (state !== cookie.state) {
    clearPkceCookie(event);
    return sendRedirect(event, '/dashboard?openrouter=error&reason=state_mismatch', 302);
  }

  // Clear before the network call so a failure mid-exchange still
  // invalidates the verifier and a retry starts a fresh PKCE round.
  clearPkceCookie(event);

  let exchange;
  try {
    exchange = await exchangeCodeForKey(code, cookie.codeVerifier);
  } catch {
    return sendRedirect(event, '/dashboard?openrouter=error&reason=exchange_failed', 302);
  }

  const { fermiKek } = useRuntimeConfig(event);
  const kek = await getKek(fermiKek);
  const admin = useSupabaseAdmin();

  try {
    await storeCredential(admin, kek, {
      userId: user.id,
      channelId: null,
      keyType: 'openrouter',
      plaintext: exchange.key,
      metadata: exchange.userId ? { openrouter_user_id: exchange.userId } : undefined,
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      return sendRedirect(event, '/dashboard?openrouter=error&reason=already_connected', 302);
    }
    throw err;
  }

  return sendRedirect(event, '/dashboard?openrouter=connected', 302);
});
