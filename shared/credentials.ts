import type { SupabaseClient } from '@supabase/supabase-js';
import { type EncryptedCredential, decryptCredential, encryptCredential } from './crypto.ts';

export type KeyType
  = | 'openrouter'
    | 'line_channel_access_token'
    | 'line_channel_secret'
    | 'openai'
    | 'tavily'
    | 'fal'
    | 'github'
    | 'twinkle'
    | 'byo_mcp';

type Bytes = Uint8Array<ArrayBuffer>;

const bytesToPgHex = (bytes: Bytes): string =>
  '\\x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

const pgHexToBytes = (hex: string): Bytes => {
  const stripped = hex.startsWith('\\x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

// AAD binds the ciphertext to its full scope so a row can't be swapped
// across users / key types / owners. Colon-joined and injective: every
// field is a UUID or the KeyType enum, none of which contain `:`, so no
// two distinct tuples collapse to the same string. Fixed 4-segment arity
// — a null scope column is the empty segment, not an omitted one.
const buildAad = (
  userId: string,
  keyType: KeyType,
  botId: string | null,
  capabilityId: string | null,
): string => `${userId}:${keyType}:${botId ?? ''}:${capabilityId ?? ''}`;

export interface LoadCredentialParams {
  userId:        string;
  botId:         string | null;
  keyType:       KeyType;
  // BYO MCP token scope. Mutually exclusive with botId (DB CHECK). Omit
  // (defaults null) for account-level and bot-scoped credentials.
  capabilityId?: string | null;
}

export interface StoreCredentialParams extends LoadCredentialParams {
  plaintext:         string;
  refreshPlaintext?: string;
  metadata?:         Record<string, unknown>;
}

export const storeCredential = async (
  admin: SupabaseClient,
  kek: CryptoKey,
  params: StoreCredentialParams,
): Promise<void> => {
  const { userId, botId, keyType, plaintext, refreshPlaintext, metadata, capabilityId = null } = params;
  const aad = buildAad(userId, keyType, botId, capabilityId);
  const enc = await encryptCredential(plaintext, kek, aad, refreshPlaintext);
  const { error } = await admin.from('encrypted_credentials').insert({
    user_id:            userId,
    bot_id:             botId,
    capability_id:      capabilityId,
    key_type:           keyType,
    ciphertext:         bytesToPgHex(enc.ciphertext),
    iv:                 bytesToPgHex(enc.iv),
    wrapped_dek:        bytesToPgHex(enc.wrappedDek),
    wrapped_dek_iv:     bytesToPgHex(enc.wrappedDekIv),
    alg:                enc.alg,
    refresh_ciphertext: enc.refreshCiphertext ? bytesToPgHex(enc.refreshCiphertext) : null,
    refresh_iv:         enc.refreshIv ? bytesToPgHex(enc.refreshIv) : null,
    metadata:           metadata ?? null,
  });
  if (error) throw error;
};

export const loadCredential = async (
  admin: SupabaseClient,
  kek: CryptoKey,
  params: LoadCredentialParams,
): Promise<{ plaintext: string; refreshPlaintext?: string }> => {
  const { userId, botId, keyType, capabilityId = null } = params;
  let query = admin
    .from('encrypted_credentials')
    .select('ciphertext, iv, wrapped_dek, wrapped_dek_iv, alg, refresh_ciphertext, refresh_iv')
    .eq('user_id', userId)
    .eq('key_type', keyType);
  // Both scope columns are filtered (eq or is-null) so the three scopes
  // — account / bot / capability — never alias onto each other's row.
  query = botId ? query.eq('bot_id', botId) : query.is('bot_id', null);
  query = capabilityId ? query.eq('capability_id', capabilityId) : query.is('capability_id', null);
  const { data, error } = await query.single();
  if (error) throw error;

  const aad = buildAad(userId, keyType, botId, capabilityId);
  const sealed: EncryptedCredential = {
    ciphertext:        pgHexToBytes(data.ciphertext),
    iv:                pgHexToBytes(data.iv),
    wrappedDek:        pgHexToBytes(data.wrapped_dek),
    wrappedDekIv:      pgHexToBytes(data.wrapped_dek_iv),
    alg:               data.alg,
    refreshCiphertext: data.refresh_ciphertext ? pgHexToBytes(data.refresh_ciphertext) : undefined,
    refreshIv:         data.refresh_iv ? pgHexToBytes(data.refresh_iv) : undefined,
  };
  return decryptCredential(sealed, kek, aad);
};
