import { describe, expect, it } from 'vitest';
import { useKek } from '../../shared/kek';

const validKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const tooShort = 'dGVzdA==';

describe('useKek', () => {
  it('returns the same CryptoKey for repeated calls with the same base64', async () => {
    const a = await useKek(validKey);
    const b = await useKek(validKey);
    expect(a).toBe(b);
  });

  it('rejects when base64 is empty', async () => {
    await expect(useKek('')).rejects.toThrow('FERMI_KEK must be set');
  });

  it('evicts a rejected entry so the next call can recover', async () => {
    await expect(useKek(tooShort)).rejects.toThrow();
    // If the rejected promise stayed cached, this would re-throw the
    // same error instead of importing a fresh CryptoKey.
    const key = await useKek(validKey);
    expect(key).toBeDefined();
  });
});
