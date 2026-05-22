import { describe, expect, it } from 'vitest';
import { decryptCredential, encryptCredential, loadKek } from '../../shared/crypto';

const TEST_KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const AAD = 'user-uuid-1:line_channel_access_token:channel-uuid-1';

describe('envelope encryption', () => {
  it('round-trips a credential through encrypt and decrypt', async () => {
    const kek = await loadKek(TEST_KEY);
    const encrypted = await encryptCredential('my-line-channel-secret', kek, AAD);
    const opened = await decryptCredential(encrypted, kek, AAD);
    expect(opened.plaintext).toBe('my-line-channel-secret');
  });

  it('round-trips both access and refresh tokens', async () => {
    const kek = await loadKek(TEST_KEY);
    const encrypted = await encryptCredential('access-token', kek, AAD, 'refresh-token');
    const opened = await decryptCredential(encrypted, kek, AAD);
    expect(opened.plaintext).toBe('access-token');
    expect(opened.refreshPlaintext).toBe('refresh-token');
  });

  it('uses a fresh IV for the refresh ciphertext within the same row', async () => {
    const kek = await loadKek(TEST_KEY);
    const encrypted = await encryptCredential('a', kek, AAD, 'b');
    expect(encrypted.refreshIv).not.toEqual(encrypted.iv);
  });

  it('produces fresh DEK + IVs each call', async () => {
    const kek = await loadKek(TEST_KEY);
    const a = await encryptCredential('same-plaintext', kek, AAD);
    const b = await encryptCredential('same-plaintext', kek, AAD);
    expect(a.wrappedDek).not.toEqual(b.wrappedDek);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it('rejects a KEK that does not decode to 32 bytes', async () => {
    await expect(loadKek('dGVzdA==')).rejects.toThrow('FERMI_KEK must decode to 32 bytes');
  });

  it('fails to decrypt with wrong KEK', async () => {
    const kek = await loadKek(TEST_KEY);
    const wrongKek = await loadKek(btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))));
    const encrypted = await encryptCredential('secret', kek, AAD);
    await expect(decryptCredential(encrypted, wrongKek, AAD)).rejects.toThrow();
  });

  it('fails to decrypt with mismatched AAD', async () => {
    const kek = await loadKek(TEST_KEY);
    const encrypted = await encryptCredential('secret', kek, AAD);
    await expect(decryptCredential(encrypted, kek, 'different-aad')).rejects.toThrow();
  });

  it('fails when ciphertext is tampered with', async () => {
    const kek = await loadKek(TEST_KEY);
    const encrypted = await encryptCredential('secret', kek, AAD);
    encrypted.ciphertext[0] ^= 0xff;
    await expect(decryptCredential(encrypted, kek, AAD)).rejects.toThrow();
  });

  it('fails when wrappedDek is tampered with', async () => {
    const kek = await loadKek(TEST_KEY);
    const encrypted = await encryptCredential('secret', kek, AAD);
    encrypted.wrappedDek[0] ^= 0xff;
    await expect(decryptCredential(encrypted, kek, AAD)).rejects.toThrow();
  });

  it('rejects unknown alg', async () => {
    const kek = await loadKek(TEST_KEY);
    const encrypted = await encryptCredential('secret', kek, AAD);
    encrypted.alg = 'aes-gcm-128';
    await expect(decryptCredential(encrypted, kek, AAD)).rejects.toThrow('Unsupported alg');
  });
});
