import { describe, expect, it } from 'vitest';
import { updateProfileInputSchema } from '../../shared/schemas/profile';

describe('updateProfileInputSchema', () => {
  it('accepts a subset of whitelisted fields', () => {
    const result = updateProfileInputSchema.safeParse({ display_name: 'Memo' });
    expect(result.success).toBe(true);
  });

  it('accepts all whitelisted fields together', () => {
    const result = updateProfileInputSchema.safeParse({
      display_name: 'Memo',
      locale: 'zh-Hant',
      timezone: 'Asia/Taipei',
      avatar_url: 'https://example.com/a.png',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty object (endpoint enforces non-empty)', () => {
    const result = updateProfileInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects unknown keys via strict mode', () => {
    const result = updateProfileInputSchema.safeParse({ display_name: 'Memo', foo: 'bar' });
    expect(result.success).toBe(false);
  });

  it('rejects writes to tier (the self-promotion vector)', () => {
    const result = updateProfileInputSchema.safeParse({ tier: 'pro' });
    expect(result.success).toBe(false);
  });

  it('rejects writes to is_admin (the self-promotion vector)', () => {
    const result = updateProfileInputSchema.safeParse({ is_admin: true });
    expect(result.success).toBe(false);
  });

  it('rejects writes to email (set by OAuth, not user-editable)', () => {
    const result = updateProfileInputSchema.safeParse({ email: 'other@example.com' });
    expect(result.success).toBe(false);
  });
});
