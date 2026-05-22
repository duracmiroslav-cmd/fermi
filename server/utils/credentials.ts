import type { SupabaseClient } from '@supabase/supabase-js';
import { type EncryptedCredential, decryptCredential, encryptCredential } from '~~/shared/crypto';
import { useKek } from '~~/shared/kek';

type KeyType
  = | 'openrouter'
    | 'line_channel_access_token'
    | 'line_channel_secret'
    | 'anthropic'
    | 'openai'
    | 'gemini';

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

const buildAad = (userId: string, keyType: KeyType, channelId: string | null): string =>
  `${userId}:${keyType}:${channelId ?? ''}`;

const loadKekFromConfig = (): Promise<CryptoKey> => {
  const { fermiKek } = useRuntimeConfig();
  return useKek(fermiKek);
};

export interface StoreCredentialParams {
  userId: string;
  channelId: string | null;
  keyType: KeyType;
  plaintext: string;
  refreshPlaintext?: string;
}

export const storeCredential = async (
  admin: SupabaseClient,
  params: StoreCredentialParams,
): Promise<void> => {
  const { userId, channelId, keyType, plaintext, refreshPlaintext } = params;
  const kek = await loadKekFromConfig();
  const aad = buildAad(userId, keyType, channelId);
  const enc = await encryptCredential(plaintext, kek, aad, refreshPlaintext);
  const { error } = await admin.from('encrypted_credentials').insert({
    user_id: userId,
    channel_id: channelId,
    key_type: keyType,
    ciphertext: bytesToPgHex(enc.ciphertext),
    iv: bytesToPgHex(enc.iv),
    wrapped_dek: bytesToPgHex(enc.wrappedDek),
    wrapped_dek_iv: bytesToPgHex(enc.wrappedDekIv),
    alg: enc.alg,
    refresh_ciphertext: enc.refreshCiphertext ? bytesToPgHex(enc.refreshCiphertext) : null,
    refresh_iv: enc.refreshIv ? bytesToPgHex(enc.refreshIv) : null,
  });
  if (error) throw error;
};

export interface LoadCredentialParams {
  userId: string;
  channelId: string | null;
  keyType: KeyType;
}

export const loadCredential = async (
  admin: SupabaseClient,
  params: LoadCredentialParams,
): Promise<{ plaintext: string; refreshPlaintext?: string }> => {
  const { userId, channelId, keyType } = params;
  const query = admin
    .from('encrypted_credentials')
    .select('ciphertext, iv, wrapped_dek, wrapped_dek_iv, alg, refresh_ciphertext, refresh_iv')
    .eq('user_id', userId)
    .eq('key_type', keyType);
  const { data, error } = channelId
    ? await query.eq('channel_id', channelId).single()
    : await query.is('channel_id', null).single();
  if (error) throw error;

  const kek = await loadKekFromConfig();
  const aad = buildAad(userId, keyType, channelId);
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
