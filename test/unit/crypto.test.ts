import { describe, expect, it } from 'vitest';
import { decryptCredential, encryptCredential, loadKek } from '../../shared/crypto';

const TEST_KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const AAD = 'user-uuid-1:line_channel_access_token:bot-uuid-1';

describe('envelope encryption', () => {
  describe('round-trip', () => {
    it('encrypts and decrypts a credential', async () => {
      const kek = await loadKek(TEST_KEY);
      const encrypted = await encryptCredential('my-line-channel-secret', kek, AAD);
      const opened = await decryptCredential(encrypted, kek, AAD);
      expect(opened.plaintext).toBe('my-line-channel-secret');
    });

    it('encrypts and decrypts access + refresh tokens', async () => {
      const kek = await loadKek(TEST_KEY);
      const encrypted = await encryptCredential('access-token', kek, AAD, 'refresh-token');
      const opened = await decryptCredential(encrypted, kek, AAD);
      expect(opened.plaintext).toBe('access-token');
      expect(opened.refreshPlaintext).toBe('refresh-token');
    });
  });

  describe('cryptographic properties', () => {
    it('uses fresh IV for refresh ciphertext within the same row', async () => {
      const kek = await loadKek(TEST_KEY);
      const encrypted = await encryptCredential('a', kek, AAD, 'b');
      expect(encrypted.refreshIv).not.toEqual(encrypted.iv);
    });

    it('produces fresh DEK + IVs per call', async () => {
      const kek = await loadKek(TEST_KEY);
      const a = await encryptCredential('same-plaintext', kek, AAD);
      const b = await encryptCredential('same-plaintext', kek, AAD);
      expect(a.wrappedDek).not.toEqual(b.wrappedDek);
      expect(a.iv).not.toEqual(b.iv);
      expect(a.ciphertext).not.toEqual(b.ciphertext);
    });
  });

  describe('error cases', () => {
    it('loadKek rejects KEK not 32 bytes', async () => {
      await expect(loadKek('dGVzdA==')).rejects.toThrow('FERMI_KEK must decode to 32 bytes');
    });

    it('decryptCredential rejects wrong KEK', async () => {
      const kek = await loadKek(TEST_KEY);
      const wrongKek = await loadKek(btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))));
      const encrypted = await encryptCredential('secret', kek, AAD);
      await expect(decryptCredential(encrypted, wrongKek, AAD)).rejects.toThrow();
    });

    it('decryptCredential rejects mismatched AAD', async () => {
      const kek = await loadKek(TEST_KEY);
      const encrypted = await encryptCredential('secret', kek, AAD);
      await expect(decryptCredential(encrypted, kek, 'different-aad')).rejects.toThrow();
    });

    it('decryptCredential rejects tampered ciphertext', async () => {
      const kek = await loadKek(TEST_KEY);
      const encrypted = await encryptCredential('secret', kek, AAD);
      encrypted.ciphertext[0] ^= 0xff;
      await expect(decryptCredential(encrypted, kek, AAD)).rejects.toThrow();
    });

    it('decryptCredential rejects tampered wrappedDek', async () => {
      const kek = await loadKek(TEST_KEY);
      const encrypted = await encryptCredential('secret', kek, AAD);
      encrypted.wrappedDek[0] ^= 0xff;
      await expect(decryptCredential(encrypted, kek, AAD)).rejects.toThrow();
    });

    it('decryptCredential rejects unknown alg', async () => {
      const kek = await loadKek(TEST_KEY);
      const encrypted = await encryptCredential('secret', kek, AAD);
      encrypted.alg = 'aes-gcm-128';
      await expect(decryptCredential(encrypted, kek, AAD)).rejects.toThrow('Unsupported alg');
    });
  });
});
