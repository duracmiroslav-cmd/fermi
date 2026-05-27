import type { H3Event } from 'h3';

// PKCE state cookie. SameSite=Lax lets the redirect-back from
// OpenRouter carry it; Strict would drop it. Path is scoped so
// the cookie only travels to OAuth endpoints.

const COOKIE_NAME = 'or_pkce';
const COOKIE_PATH = '/api/oauth/openrouter';
const COOKIE_MAX_AGE_SECONDS = 300;

export interface PkceCookiePayload {
  state:        string;
  codeVerifier: string;
}

export const setPkceCookie = (event: H3Event, payload: PkceCookiePayload): void => {
  setCookie(event, COOKIE_NAME, JSON.stringify(payload), {
    httpOnly: true,
    secure:   !import.meta.dev,
    sameSite: 'lax',
    path:     COOKIE_PATH,
    maxAge:   COOKIE_MAX_AGE_SECONDS,
  });
};

export const readPkceCookie = (event: H3Event): PkceCookiePayload | null => {
  const raw = getCookie(event, COOKIE_NAME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PkceCookiePayload>;
    if (typeof parsed.state !== 'string' || typeof parsed.codeVerifier !== 'string') return null;
    return { state: parsed.state, codeVerifier: parsed.codeVerifier };
  } catch {
    return null;
  }
};

export const clearPkceCookie = (event: H3Event): void => {
  deleteCookie(event, COOKIE_NAME, { path: COOKIE_PATH });
};
