import { describe, expect, it } from 'vitest';
import { normalizeTraditional } from '../../supabase/functions/agent/opencc';

describe('normalizeTraditional', () => {
  describe('Simplified → Taiwan Traditional', () => {
    it('converts Simplified characters to Taiwan forms', () => {
      expect(normalizeTraditional('内存里有一只猫')).toBe('內存裡有一隻貓');
    });

    // s2twp (phrase mode) would rewrite these to 軟體 / 滑鼠 / 記憶體; s2tw
    // maps characters only. Guards the deliberate char-level variant choice
    // against a switch to phrase substitution.
    it('maps characters only, without phrase substitution (s2tw, not s2twp)', () => {
      expect(normalizeTraditional('软件')).toBe('軟件');
      expect(normalizeTraditional('鼠标')).toBe('鼠標');
      expect(normalizeTraditional('内存')).toBe('內存');
    });
  });

  describe('left untouched', () => {
    it('passes non-Chinese text through verbatim', () => {
      expect(normalizeTraditional('Hello, world! 123')).toBe('Hello, world! 123');
    });

    it('is idempotent on already-Traditional text', () => {
      const traditional = '已經是繁體中文了';
      expect(normalizeTraditional(traditional)).toBe(traditional);
    });
  });
});
