// Envelope encryption with AES-GCM-256. Web Crypto API only,
// so this module runs on both Node (Nuxt server) and Deno (Edge Function).
//
// Pattern per row:
//   1. Generate a random DEK (data encryption key).
//   2. Encrypt the credential with the DEK -> ciphertext + iv.
//      Refresh token (when present) uses the same DEK with a fresh IV.
//   3. Wrap the DEK itself with the KEK (master key from APP_KEY)
//      -> wrappedDek + wrappedDekIv.
//   4. Every AES-GCM operation binds an AAD string (typically
//      `${userId}:${keyType}:${channelId ?? ''}`) so a row's
//      ciphertext+iv+wrappedDek triple cannot be swapped to another row.

const ALG = 'AES-GCM';
const ALG_TAG = 'aes-gcm-256';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const KEY_BYTES = 32;

export interface SealedCredential {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  wrappedDek: Uint8Array;
  wrappedDekIv: Uint8Array;
  alg: string;
  refreshCiphertext?: Uint8Array;
  refreshIv?: Uint8Array;
}

export const loadKek = (base64: string): Promise<CryptoKey> => {
  const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  if (raw.length !== KEY_BYTES) {
    return Promise.reject(new Error(`APP_KEY must decode to ${KEY_BYTES} bytes (got ${raw.length})`));
  }
  return crypto.subtle.importKey('raw', raw, { name: ALG }, false, ['encrypt', 'decrypt']);
};

const generateDek = (): Promise<CryptoKey> =>
  crypto.subtle.generateKey({ name: ALG, length: KEY_LENGTH }, true, ['encrypt', 'decrypt']);

const encodeAad = (aad: string): Uint8Array => new TextEncoder().encode(aad);

const wrapDek = async (
  dek: CryptoKey,
  kek: CryptoKey,
  aad: Uint8Array,
): Promise<{ wrappedDek: Uint8Array; iv: Uint8Array }> => {
  const rawDek = await crypto.subtle.exportKey('raw', dek);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const wrapped = await crypto.subtle.encrypt({ name: ALG, iv, additionalData: aad }, kek, rawDek);
  return { wrappedDek: new Uint8Array(wrapped), iv };
};

const unwrapDek = async (
  wrappedDek: Uint8Array,
  iv: Uint8Array,
  kek: CryptoKey,
  aad: Uint8Array,
): Promise<CryptoKey> => {
  const rawDek = await crypto.subtle.decrypt({ name: ALG, iv, additionalData: aad }, kek, wrappedDek);
  return crypto.subtle.importKey('raw', rawDek, { name: ALG }, false, ['encrypt', 'decrypt']);
};

const encryptWith = async (
  plaintext: string,
  dek: CryptoKey,
  aad: Uint8Array,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> => {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const data = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt({ name: ALG, iv, additionalData: aad }, dek, data);
  return { ciphertext: new Uint8Array(ct), iv };
};

const decryptWith = async (
  ciphertext: Uint8Array,
  iv: Uint8Array,
  dek: CryptoKey,
  aad: Uint8Array,
): Promise<string> => {
  const pt = await crypto.subtle.decrypt({ name: ALG, iv, additionalData: aad }, dek, ciphertext);
  return new TextDecoder().decode(pt);
};

export const sealCredential = async (
  plaintext: string,
  kek: CryptoKey,
  aad: string,
  refreshPlaintext?: string,
): Promise<SealedCredential> => {
  const aadBytes = encodeAad(aad);
  const dek = await generateDek();
  const { wrappedDek, iv: wrappedDekIv } = await wrapDek(dek, kek, aadBytes);
  const { ciphertext, iv } = await encryptWith(plaintext, dek, aadBytes);
  const sealed: SealedCredential = { ciphertext, iv, wrappedDek, wrappedDekIv, alg: ALG_TAG };
  if (refreshPlaintext !== undefined) {
    const { ciphertext: rc, iv: ri } = await encryptWith(refreshPlaintext, dek, aadBytes);
    sealed.refreshCiphertext = rc;
    sealed.refreshIv = ri;
  }
  return sealed;
};

export const openCredential = async (
  sealed: SealedCredential,
  kek: CryptoKey,
  aad: string,
): Promise<{ plaintext: string; refreshPlaintext?: string }> => {
  if (sealed.alg !== ALG_TAG) {
    throw new Error(`Unsupported alg: ${sealed.alg}`);
  }
  const aadBytes = encodeAad(aad);
  const dek = await unwrapDek(sealed.wrappedDek, sealed.wrappedDekIv, kek, aadBytes);
  const plaintext = await decryptWith(sealed.ciphertext, sealed.iv, dek, aadBytes);
  const out: { plaintext: string; refreshPlaintext?: string } = { plaintext };
  if (sealed.refreshCiphertext && sealed.refreshIv) {
    out.refreshPlaintext = await decryptWith(sealed.refreshCiphertext, sealed.refreshIv, dek, aadBytes);
  }
  return out;
};
