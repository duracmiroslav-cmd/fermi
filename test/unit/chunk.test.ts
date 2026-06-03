import { describe, expect, it } from 'vitest';
import { DEFAULT_OVERLAP, chunkText } from '../../shared/chunk';

describe('chunkText', () => {
  it('returns nothing for empty or whitespace-only input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  \t ')).toEqual([]);
  });

  it('returns a single chunk when the text fits under the limit', () => {
    const text = 'Store hours: 9 to 5, closed Mondays.';
    expect(chunkText(text, { maxChars: 1000 })).toEqual([text]);
  });

  it('splits long text into multiple chunks', () => {
    const text = 'a'.repeat(2500);
    const chunks = chunkText(text, { maxChars: 1000, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    // No chunk exceeds the limit (boundary search only pulls `end` back).
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000);
  });

  it('prefers to break on a sentence boundary', () => {
    // Two sentences; the first ends well inside the window, so the first
    // chunk should end at that boundary rather than mid-second-sentence.
    const first = `${'x'.repeat(700)}。`;
    const second = `${'y'.repeat(700)}。`;
    const chunks = chunkText(first + second, { maxChars: 1000, overlap: 0 });
    expect(chunks[0]).toBe(first);
  });

  it('breaks on a full-width CJK period', () => {
    const a = `${'甲'.repeat(600)}。`;
    const b = `${'乙'.repeat(600)}。`;
    const chunks = chunkText(a + b, { maxChars: 900, overlap: 0 });
    expect(chunks[0]).toBe(a);
  });

  it('carries overlap from the end of one chunk into the next', () => {
    // No boundary chars → hard cuts, so the seam is deterministic: chunk 2
    // starts `overlap` chars before chunk 1 ended.
    const text = 'a'.repeat(1000) + 'b'.repeat(1000);
    const chunks = chunkText(text, { maxChars: 1000, overlap: DEFAULT_OVERLAP });
    expect(chunks[1].startsWith('a'.repeat(DEFAULT_OVERLAP))).toBe(true);
  });

  it('always makes progress (no infinite loop) even with huge overlap', () => {
    const text = 'a'.repeat(5000);
    const chunks = chunkText(text, { maxChars: 100, overlap: 500 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThan(text.length); // terminated
  });
});
