import { describe, expect, it } from 'vitest';
import { getKek } from '../../shared/kek';

const validKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const tooShort = 'dGVzdA==';

describe('getKek', () => {
  it('returns the same CryptoKey for repeated calls with the same base64', async () => {
    const a = await getKek(validKey);
    const b = await getKek(validKey);
    expect(a).toBe(b);
  });

  it('rejects when base64 is empty', async () => {
    await expect(getKek('')).rejects.toThrow('FERMI_KEK must be set');
  });

  it('evicts a rejected entry so the next call can recover', async () => {
    await expect(getKek(tooShort)).rejects.toThrow();
    // If the rejected promise stayed cached, this would re-throw the
    // same error instead of importing a fresh CryptoKey.
    const key = await getKek(validKey);
    expect(key).toBeDefined();
  });
});
