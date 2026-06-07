import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCredential } from './credentials.ts';

// Single point that decides which key to use for a paid external service
// call. Self-host model: the keys belong to the operator. Prefer the key
// they connected in the dashboard (stored encrypted, per provider); fall
// back to the one configured in the deployment environment. With neither,
// the call can't proceed, so we surface a clear "not configured" error
// rather than failing silently.
//
// Callers pass the env key candidate explicitly (read upstream) rather than
// have this helper reach into Deno.env directly, because `shared/` files are
// imported by both the Deno worker and the Node Nuxt server; env-access shape
// differs.

// `twinkle` is an MCP bearer token rather than a REST key, but it resolves the
// same way, so it goes through here too (see agent/tools/index.ts). github /
// byo_mcp stay connection-only and are not purposes.
export type KeyPurpose = 'openrouter' | 'openai' | 'tavily' | 'fal' | 'twinkle';

export interface KeyResult {
  key: string;
}

export class KeyNotConfiguredError extends Error {
  constructor(public readonly purpose: KeyPurpose) {
    super(`key_not_configured:${purpose}`);
  }
}

export const resolveKey = async (
  admin: SupabaseClient,
  kek: CryptoKey,
  params: {
    ownerId:     string;
    purpose:     KeyPurpose;
    // Environment fallback candidate. `null` means "nothing configured in
    // the environment", so with no connected key the call trips
    // KeyNotConfiguredError.
    platformKey: string | null;
  },
): Promise<KeyResult> => {
  try {
    const { plaintext } = await loadCredential(admin, kek, {
      userId:  params.ownerId,
      botId:   null,
      keyType: params.purpose,
    });
    return { key: plaintext };
  } catch (err) {
    // PGRST116 = no row from .single(), owner hasn't connected this
    // provider yet. Re-throw anything else (decryption failures etc.).
    if ((err as { code?: string })?.code !== 'PGRST116') throw err;
  }

  if (!params.platformKey) {
    throw new KeyNotConfiguredError(params.purpose);
  }
  return { key: params.platformKey };
};
