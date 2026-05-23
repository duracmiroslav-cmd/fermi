import { describe, expect, it } from 'vitest';
import { updateProfileInputSchema } from '../../shared/schemas/profile';

describe('updateProfileInputSchema', () => {
  describe('accepts whitelisted fields', () => {
    it('display_name only', () => {
      const result = updateProfileInputSchema.safeParse({ display_name: 'Memo' });
      expect(result.success).toBe(true);
    });

    it('all 4 whitelisted fields', () => {
      const result = updateProfileInputSchema.safeParse({
        display_name: 'Memo',
        locale: 'zh-Hant',
        timezone: 'Asia/Taipei',
        avatar_url: 'https://example.com/a.png',
      });
      expect(result.success).toBe(true);
    });

    it('empty object (endpoint enforces non-empty)', () => {
      const result = updateProfileInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('rejects self-promotion vectors', () => {
    it('tier', () => {
      const result = updateProfileInputSchema.safeParse({ tier: 'pro' });
      expect(result.success).toBe(false);
    });

    it('is_admin', () => {
      const result = updateProfileInputSchema.safeParse({ is_admin: true });
      expect(result.success).toBe(false);
    });

    it('email (set by OAuth)', () => {
      const result = updateProfileInputSchema.safeParse({ email: 'other@example.com' });
      expect(result.success).toBe(false);
    });
  });

  describe('schema strictness', () => {
    it('rejects unknown keys', () => {
      const result = updateProfileInputSchema.safeParse({ display_name: 'Memo', foo: 'bar' });
      expect(result.success).toBe(false);
    });

    it('rejects non-canonical locale (must go through normalizeLocale first)', () => {
      const result = updateProfileInputSchema.safeParse({ locale: 'zh-CN' });
      expect(result.success).toBe(false);
    });
  });
});
