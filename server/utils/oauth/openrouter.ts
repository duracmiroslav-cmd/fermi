// OpenRouter PKCE OAuth helpers.
//
// OpenRouter's PKCE flow has no client_id / client_secret and no app
// registration — any callback URL works. The exchange returns a
// long-lived user-controlled API key (no access/refresh split), so
// `refresh_ciphertext` on encrypted_credentials stays null.

const AUTHORIZE_URL = 'https://openrouter.ai/auth';
const TOKEN_URL = 'https://openrouter.ai/api/v1/auth/keys';

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const randomBase64Url = (byteLength: number): string =>
  bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));

export const generateState = (): string => randomBase64Url(16);

export const generateVerifier = (): string => randomBase64Url(32);

export const deriveChallenge = async (verifier: string): Promise<string> => {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToBase64Url(new Uint8Array(digest));
};

export interface AuthorizeUrlParams {
  callbackUrl: string;
  codeChallenge: string;
  state: string;
}

export const buildAuthorizeUrl = ({ callbackUrl, codeChallenge, state }: AuthorizeUrlParams): string => {
  const params = new URLSearchParams({
    callback_url: callbackUrl,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
};

export interface ExchangeResult {
  key: string;
  userId: string | null;
}

export const exchangeCodeForKey = async (code: string, codeVerifier: string): Promise<ExchangeResult> => {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      code_challenge_method: 'S256',
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OpenRouter token exchange failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = await res.json() as { key?: string; user_id?: string | null };
  if (!data.key) {
    throw new Error('OpenRouter token exchange returned no key');
  }
  return { key: data.key, userId: data.user_id ?? null };
};
