import type { SupabaseClient } from '@supabase/supabase-js';
import { type EncryptedCredential, decryptCredential, encryptCredential } from './crypto.ts';

export type KeyType
  = | 'openrouter'
    | 'line_channel_access_token'
    | 'line_channel_secret'
    | 'anthropic'
    | 'openai'
    | 'gemini'
    | 'tavily'
    | 'fal';

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

const buildAad = (userId: string, keyType: KeyType, botId: string | null): string =>
  `${userId}:${keyType}:${botId ?? ''}`;

export interface LoadCredentialParams {
  userId: string;
  botId: string | null;
  keyType: KeyType;
}

export interface StoreCredentialParams extends LoadCredentialParams {
  plaintext: string;
  refreshPlaintext?: string;
  metadata?: Record<string, unknown>;
}

export const storeCredential = async (
  admin: SupabaseClient,
  kek: CryptoKey,
  params: StoreCredentialParams,
): Promise<void> => {
  const { userId, botId, keyType, plaintext, refreshPlaintext, metadata } = params;
  const aad = buildAad(userId, keyType, botId);
  const enc = await encryptCredential(plaintext, kek, aad, refreshPlaintext);
  const { error } = await admin.from('encrypted_credentials').insert({
    user_id: userId,
    bot_id: botId,
    key_type: keyType,
    ciphertext: bytesToPgHex(enc.ciphertext),
    iv: bytesToPgHex(enc.iv),
    wrapped_dek: bytesToPgHex(enc.wrappedDek),
    wrapped_dek_iv: bytesToPgHex(enc.wrappedDekIv),
    alg: enc.alg,
    refresh_ciphertext: enc.refreshCiphertext ? bytesToPgHex(enc.refreshCiphertext) : null,
    refresh_iv: enc.refreshIv ? bytesToPgHex(enc.refreshIv) : null,
    metadata: metadata ?? null,
  });
  if (error) throw error;
};

export const loadCredential = async (
  admin: SupabaseClient,
  kek: CryptoKey,
  params: LoadCredentialParams,
): Promise<{ plaintext: string; refreshPlaintext?: string }> => {
  const { userId, botId, keyType } = params;
  const query = admin
    .from('encrypted_credentials')
    .select('ciphertext, iv, wrapped_dek, wrapped_dek_iv, alg, refresh_ciphertext, refresh_iv')
    .eq('user_id', userId)
    .eq('key_type', keyType);
  const { data, error } = botId
    ? await query.eq('bot_id', botId).single()
    : await query.is('bot_id', null).single();
  if (error) throw error;

  const aad = buildAad(userId, keyType, botId);
  const sealed: EncryptedCredential = {
    ciphertext: pgHexToBytes(data.ciphertext),
    iv: pgHexToBytes(data.iv),
    wrappedDek: pgHexToBytes(data.wrapped_dek),
    wrappedDekIv: pgHexToBytes(data.wrapped_dek_iv),
    alg: data.alg,
    refreshCiphertext: data.refresh_ciphertext ? pgHexToBytes(data.refresh_ciphertext) : undefined,
    refreshIv: data.refresh_iv ? pgHexToBytes(data.refresh_iv) : undefined,
  };
  return decryptCredential(sealed, kek, aad);
};
