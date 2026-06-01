// AES-GCM-256 envelope encryption.
//
// AAD binds every operation to a row identity so a ciphertext + iv +
// wrappedDek triple swapped to another row fails to decrypt. The
// unwrapped DEK is non-extractable so raw key bytes never re-enter
// JS memory.

const ALG = 'AES-GCM';
const ALG_TAG = 'aes-gcm-256';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const KEY_BYTES = 32;

// Web Crypto API rejects shared-buffer-backed views, so byte buffers
// in this module are pinned to a plain ArrayBuffer.
type Bytes = Uint8Array<ArrayBuffer>;

export interface EncryptedCredential {
  ciphertext:         Bytes;
  iv:                 Bytes;
  wrappedDek:         Bytes;
  wrappedDekIv:       Bytes;
  alg:                string;
  refreshCiphertext?: Bytes;
  refreshIv?:         Bytes;
}

export const loadKek = (base64: string): Promise<CryptoKey> => {
  const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  if (raw.length !== KEY_BYTES) {
    return Promise.reject(new Error(`FERMI_KEK must decode to ${KEY_BYTES} bytes (got ${raw.length})`));
  }
  return crypto.subtle.importKey('raw', raw, { name: ALG }, false, ['wrapKey', 'unwrapKey']);
};

const generateDek = (): Promise<CryptoKey> =>
  crypto.subtle.generateKey({ name: ALG, length: KEY_LENGTH }, true, ['encrypt', 'decrypt']);

const encodeAad = (aad: string): Bytes =>
  new Uint8Array(new TextEncoder().encode(aad));

const randomIv = (): Bytes => crypto.getRandomValues(new Uint8Array(IV_LENGTH));

const wrapDek = async (
  dek: CryptoKey,
  kek: CryptoKey,
  aad: Bytes,
): Promise<{ wrappedDek: Bytes; iv: Bytes }> => {
  const iv = randomIv();
  const wrapped = await crypto.subtle.wrapKey('raw', dek, kek, { name: ALG, iv, additionalData: aad });
  return { wrappedDek: new Uint8Array(wrapped), iv };
};

const unwrapDek = (
  wrappedDek: Bytes,
  iv: Bytes,
  kek: CryptoKey,
  aad: Bytes,
): Promise<CryptoKey> =>
  crypto.subtle.unwrapKey(
    'raw',
    wrappedDek,
    kek,
    { name: ALG, iv, additionalData: aad },
    { name: ALG },
    false,
    ['encrypt', 'decrypt'],
  );

const encryptWith = async (
  plaintext: string,
  dek: CryptoKey,
  aad: Bytes,
): Promise<{ ciphertext: Bytes; iv: Bytes }> => {
  const iv = randomIv();
  const data = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt({ name: ALG, iv, additionalData: aad }, dek, data);
  return { ciphertext: new Uint8Array(ct), iv };
};

const decryptWith = async (
  ciphertext: Bytes,
  iv: Bytes,
  dek: CryptoKey,
  aad: Bytes,
): Promise<string> => {
  const pt = await crypto.subtle.decrypt({ name: ALG, iv, additionalData: aad }, dek, ciphertext);
  return new TextDecoder().decode(pt);
};

export const encryptCredential = async (
  plaintext: string,
  kek: CryptoKey,
  aad: string,
  refreshPlaintext?: string,
): Promise<EncryptedCredential> => {
  const aadBytes = encodeAad(aad);
  const dek = await generateDek();
  const { wrappedDek, iv: wrappedDekIv } = await wrapDek(dek, kek, aadBytes);
  const { ciphertext, iv } = await encryptWith(plaintext, dek, aadBytes);
  const encrypted: EncryptedCredential = { ciphertext, iv, wrappedDek, wrappedDekIv, alg: ALG_TAG };
  if (refreshPlaintext !== undefined) {
    const { ciphertext: rc, iv: ri } = await encryptWith(refreshPlaintext, dek, aadBytes);
    encrypted.refreshCiphertext = rc;
    encrypted.refreshIv = ri;
  }
  return encrypted;
};

export const decryptCredential = async (
  encrypted: EncryptedCredential,
  kek: CryptoKey,
  aad: string,
): Promise<{ plaintext: string; refreshPlaintext?: string }> => {
  if (encrypted.alg !== ALG_TAG) {
    throw new Error(`Unsupported alg: ${encrypted.alg}`);
  }
  const aadBytes = encodeAad(aad);
  const dek = await unwrapDek(encrypted.wrappedDek, encrypted.wrappedDekIv, kek, aadBytes);
  const plaintext = await decryptWith(encrypted.ciphertext, encrypted.iv, dek, aadBytes);
  const out: { plaintext: string; refreshPlaintext?: string } = { plaintext };
  if (encrypted.refreshCiphertext && encrypted.refreshIv) {
    out.refreshPlaintext = await decryptWith(encrypted.refreshCiphertext, encrypted.refreshIv, dek, aadBytes);
  }
  return out;
};
