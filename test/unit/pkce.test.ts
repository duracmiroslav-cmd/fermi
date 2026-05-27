import { describe, expect, it } from 'vitest';
import { buildAuthorizeUrl, deriveChallenge, generateState, generateVerifier } from '../../server/utils/oauth/openrouter';

describe('PKCE helpers', () => {
  describe('generateVerifier', () => {
    it('is base64url without padding and 43 chars (32 bytes)', () => {
      const v = generateVerifier();
      expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(v).not.toContain('=');
      expect(v.length).toBe(43);
    });

    it('is random per call', () => {
      expect(generateVerifier()).not.toBe(generateVerifier());
    });
  });

  describe('generateState', () => {
    it('is base64url without padding and 22 chars (16 bytes)', () => {
      const s = generateState();
      expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(s).not.toContain('=');
      expect(s.length).toBe(22);
    });

    it('is random per call', () => {
      expect(generateState()).not.toBe(generateState());
    });
  });

  describe('deriveChallenge', () => {
    it('matches RFC 7636 appendix B vector', async () => {
      // verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
      // expected challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
      const challenge = await deriveChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
      expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    });
  });

  describe('buildAuthorizeUrl', () => {
    it('URL-encodes callback and includes all params', () => {
      const url = buildAuthorizeUrl({
        callbackUrl:   'https://fermi.tw/api/oauth/openrouter/callback',
        codeChallenge: 'CHAL',
        state:         'STATE',
      });
      expect(url.startsWith('https://openrouter.ai/auth?')).toBe(true);
      expect(url).toContain('callback_url=https%3A%2F%2Ffermi.tw%2Fapi%2Foauth%2Fopenrouter%2Fcallback');
      expect(url).toContain('code_challenge=CHAL');
      expect(url).toContain('code_challenge_method=S256');
      expect(url).toContain('state=STATE');
    });
  });
});
