import { describe, expect, it } from 'vitest';
import { normalizeLocale } from '../../shared/locale';

describe('normalizeLocale', () => {
  describe('Traditional Chinese → zh-Hant', () => {
    it('zh → zh-Hant', () => {
      expect(normalizeLocale('zh')).toBe('zh-Hant');
    });
    it('zh-TW → zh-Hant', () => {
      expect(normalizeLocale('zh-TW')).toBe('zh-Hant');
    });
    it('zh-HK → zh-Hant', () => {
      expect(normalizeLocale('zh-HK')).toBe('zh-Hant');
    });
    it('zh-MO → zh-Hant', () => {
      expect(normalizeLocale('zh-MO')).toBe('zh-Hant');
    });
    it('zh-Hant → zh-Hant', () => {
      expect(normalizeLocale('zh-Hant')).toBe('zh-Hant');
    });
    it('zh-Hant-TW → zh-Hant', () => {
      expect(normalizeLocale('zh-Hant-TW')).toBe('zh-Hant');
    });
  });

  describe('Simplified Chinese → en', () => {
    it('zh-CN → en', () => {
      expect(normalizeLocale('zh-CN')).toBe('en');
    });
    it('zh-SG → en', () => {
      expect(normalizeLocale('zh-SG')).toBe('en');
    });
    it('zh-MY → en', () => {
      expect(normalizeLocale('zh-MY')).toBe('en');
    });
    it('zh-Hans → en', () => {
      expect(normalizeLocale('zh-Hans')).toBe('en');
    });
    it('zh-Hans-CN → en', () => {
      expect(normalizeLocale('zh-Hans-CN')).toBe('en');
    });
  });

  describe('English → en', () => {
    it('en → en', () => {
      expect(normalizeLocale('en')).toBe('en');
    });
    it('en-US → en', () => {
      expect(normalizeLocale('en-US')).toBe('en');
    });
    it('en-GB → en', () => {
      expect(normalizeLocale('en-GB')).toBe('en');
    });
  });

  describe('Other languages → en', () => {
    it('ja → en', () => {
      expect(normalizeLocale('ja')).toBe('en');
    });
    it('ko → en', () => {
      expect(normalizeLocale('ko')).toBe('en');
    });
    it('th → en', () => {
      expect(normalizeLocale('th')).toBe('en');
    });
  });

  describe('Missing or invalid input → zh-Hant (DB default)', () => {
    it('null → zh-Hant', () => {
      expect(normalizeLocale(null)).toBe('zh-Hant');
    });
    it('undefined → zh-Hant', () => {
      expect(normalizeLocale(undefined)).toBe('zh-Hant');
    });
    it('empty string → zh-Hant', () => {
      expect(normalizeLocale('')).toBe('zh-Hant');
    });
    it('whitespace-only → zh-Hant', () => {
      expect(normalizeLocale('   ')).toBe('zh-Hant');
    });
  });

  describe('Input normalization', () => {
    it('case insensitive: ZH-TW → zh-Hant', () => {
      expect(normalizeLocale('ZH-TW')).toBe('zh-Hant');
    });
    it('whitespace trimmed: "  zh-TW  " → zh-Hant', () => {
      expect(normalizeLocale('  zh-TW  ')).toBe('zh-Hant');
    });
  });
});
