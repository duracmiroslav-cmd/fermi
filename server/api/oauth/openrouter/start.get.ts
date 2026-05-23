import { serverSupabaseUser } from '#supabase/server';
import { setPkceCookie } from '~~/server/utils/oauth/cookies';
import { buildAuthorizeUrl, deriveChallenge, generateState, generateVerifier } from '~~/server/utils/oauth/openrouter';

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const state = generateState();
  const codeVerifier = generateVerifier();
  setPkceCookie(event, { state, codeVerifier });

  const codeChallenge = await deriveChallenge(codeVerifier);
  const callbackUrl = new URL('/api/oauth/openrouter/callback', getRequestURL(event).origin).toString();

  return sendRedirect(event, buildAuthorizeUrl({ callbackUrl, codeChallenge, state }), 302);
});
