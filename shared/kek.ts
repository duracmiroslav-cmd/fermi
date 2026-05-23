import { loadKek } from './crypto.ts';

let cached: { base64: string; key: Promise<CryptoKey> } | null = null;

export const useKek = (base64: string): Promise<CryptoKey> => {
  if (!base64) {
    return Promise.reject(new Error('FERMI_KEK must be set'));
  }
  if (cached && cached.base64 === base64) {
    return cached.key;
  }
  cached = { base64, key: loadKek(base64) };
  return cached.key;
};
