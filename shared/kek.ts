import { loadKek } from './crypto.ts';

let cached: { base64: string; key: Promise<CryptoKey> } | null = null;

export const useKek = (base64: string): Promise<CryptoKey> => {
  if (!base64) {
    return Promise.reject(new Error('FERMI_KEK must be set'));
  }
  if (cached && cached.base64 === base64) {
    return cached.key;
  }
  const key = loadKek(base64);
  const entry = { base64, key };
  // Evict on rejection so the next call retries; without this a one-off
  // failure (malformed key, transient subtle.importKey error) would
  // pin a rejected promise here for the lifetime of the process.
  key.catch(() => {
    if (cached === entry) cached = null;
  });
  cached = entry;
  return key;
};
