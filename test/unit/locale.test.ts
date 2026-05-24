import { describe, expect, it } from 'vitest';
import { normalizeLocale } from '../../shared/locale';

describe('normalizeLocale', () => {
  describe('Chinese variants → zh-Hant', () => {
    it('zh → zh-Hant', () => {
      expect(normalizeLocale('zh')).toBe('zh-Hant');
    });
    it('zh-TW → zh-Hant', () => {
      expect(normalizeLocale('zh-TW')).toBe('zh-Hant');
    });
    it('zh-HK → zh-Hant', () => {
      expect(normalizeLocale('zh-HK')).toBe('zh-Hant');
    });
    it('zh-CN → zh-Hant', () => {
      expect(normalizeLocale('zh-CN')).toBe('zh-Hant');
    });
    it('zh-Hant-TW → zh-Hant', () => {
      expect(normalizeLocale('zh-Hant-TW')).toBe('zh-Hant');
    });
    it('zh-Hans-CN → zh-Hant', () => {
      expect(normalizeLocale('zh-Hans-CN')).toBe('zh-Hant');
    });
  });

  describe('Non-Chinese → en', () => {
    it('en → en', () => {
      expect(normalizeLocale('en')).toBe('en');
    });
    it('en-US → en', () => {
      expect(normalizeLocale('en-US')).toBe('en');
    });
    it('ja → en', () => {
      expect(normalizeLocale('ja')).toBe('en');
    });
    it('ko → en', () => {
      expect(normalizeLocale('ko')).toBe('en');
    });
  });
});
