import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCredential } from './credentials.ts';

// Single point that decides which key to use for a paid external
// service call. Encodes the fermi pricing rule:
//   Free  → must BYOK; refusing surfaces the connect-or-upgrade CTA
//   Pro   → BYOK if present, otherwise fermi's platform key
//
// Callers pass the platform key candidate explicitly (read from env
// upstream) rather than have this helper reach into Deno.env directly,
// because `shared/` files are imported by both the Deno worker and
// the Node Nuxt server; env-access shape differs.

// `twinkle` is an MCP bearer token rather than a REST key, but it follows the
// same Free→BYOK / Pro→platform rule, so it resolves through here too (see
// agent/tools/index.ts). github / byo_mcp stay BYOK-only and are not purposes.
export type KeyPurpose = 'openrouter' | 'openai' | 'tavily' | 'fal' | 'twinkle';

export type KeySource = 'byok' | 'platform';
export interface KeyResult {
  key:    string;
  source: KeySource;
}

export class FreeBYOKRequiredError extends Error {
  constructor(public readonly purpose: KeyPurpose) {
    super(`free_byok_required:${purpose}`);
  }
}

export class PlatformKeyNotConfiguredError extends Error {
  constructor(public readonly purpose: KeyPurpose) {
    super(`platform_key_not_configured:${purpose}`);
  }
}

export const resolveKey = async (
  admin: SupabaseClient,
  kek: CryptoKey,
  params: {
    ownerId:     string;
    purpose:     KeyPurpose;
    // Platform fallback candidate. `null` means "no platform key
    // configured", Pro users will trip PlatformKeyNotConfiguredError.
    platformKey: string | null;
  },
): Promise<KeyResult> => {
  try {
    const { plaintext } = await loadCredential(admin, kek, {
      userId:  params.ownerId,
      botId:   null,
      keyType: params.purpose,
    });
    return { key: plaintext, source: 'byok' };
  } catch (err) {
    // PGRST116 = no row from .single(), owner hasn't connected this
    // provider yet. Re-throw anything else (decryption failures etc.).
    if ((err as { code?: string })?.code !== 'PGRST116') throw err;
  }

  const { data: user, error: tierErr } = await admin
    .from('users')
    .select('tier')
    .eq('id', params.ownerId)
    .single();
  if (tierErr) throw tierErr;

  if (user.tier !== 'pro') {
    throw new FreeBYOKRequiredError(params.purpose);
  }
  if (!params.platformKey) {
    throw new PlatformKeyNotConfiguredError(params.purpose);
  }
  return { key: params.platformKey, source: 'platform' };
};
