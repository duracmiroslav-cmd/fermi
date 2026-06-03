import { describe, expect, it } from 'vitest';
import { stripMarkdown } from '../../supabase/functions/agent/markdown';

// LINE renders no markdown, so the worker flattens replies before delivery.
// These lock the contracts that matter on LINE: formatting collapses to its
// text, but a link's URL survives (LINE auto-links bare URLs, so dropping it
// would turn a tappable reference into dead text).
describe('stripMarkdown', () => {
  describe('inline formatting collapses to its text', () => {
    it('unwraps bold, italic, and strikethrough', () => {
      expect(stripMarkdown('**台積電** is *up* and ~~down~~')).toBe('台積電 is up and down');
    });

    it('keeps inline code content without the backticks', () => {
      expect(stripMarkdown('run `npm test` now')).toBe('run npm test now');
    });
  });

  describe('links keep their URL (the LINE-critical rule)', () => {
    it('rewrites [label](url) to "label url"', () => {
      expect(stripMarkdown('see [MSN 天氣](https://msn.com) today'))
        .toBe('see MSN 天氣 https://msn.com today');
    });

    it('does not duplicate the URL when label equals the URL', () => {
      expect(stripMarkdown('[https://x.com](https://x.com)')).toBe('https://x.com');
    });

    it('drops an image to its alt text', () => {
      expect(stripMarkdown('![a cat](https://x.com/cat.png)')).toBe('a cat');
    });
  });

  describe('block structure flattens to plain lines', () => {
    it('strips heading markers', () => {
      expect(stripMarkdown('# Title\n\nbody')).toBe('Title\n\nbody');
    });

    it('keeps bullet list markers as literal dashes', () => {
      expect(stripMarkdown('- a\n- b')).toBe('- a\n- b');
    });

    it('renders ordered lists with their numbers', () => {
      expect(stripMarkdown('1. first\n2. second')).toBe('1. first\n2. second');
    });

    it('keeps fenced code content, dropping the fences', () => {
      expect(stripMarkdown('```js\nconst x = 1;\n```')).toBe('const x = 1;');
    });
  });

  describe('left untouched', () => {
    it('passes plain text through verbatim', () => {
      expect(stripMarkdown('在喔～ 想查哪裡的天氣呢？')).toBe('在喔～ 想查哪裡的天氣呢？');
    });

    it('leaves a bare URL alone for LINE to auto-link', () => {
      expect(stripMarkdown('see https://x.com')).toBe('see https://x.com');
    });

    it('is idempotent on already-plain output', () => {
      const plain = '台積電 https://x.com';
      expect(stripMarkdown(plain)).toBe(plain);
    });
  });
});
