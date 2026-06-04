import { describe, expect, it } from 'vitest';
import { chunkText } from '../../shared/chunk';

describe('chunkText', () => {
  it('returns nothing for empty or whitespace-only input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  \t ')).toEqual([]);
  });

  it('returns a single chunk for one short paragraph (no blank lines)', () => {
    const text = 'Store hours: 9 to 5, closed Mondays.';
    expect(chunkText(text)).toEqual([text]);
  });

  it('emits one chunk per blank-line section', () => {
    const doc = ['Section A\nline a', 'Section B\nline b', 'Section C'].join('\n\n');
    expect(chunkText(doc)).toEqual(['Section A\nline a', 'Section B\nline b', 'Section C']);
  });

  // Regression: the whole document used to embed as one diluted chunk, so a
  // query about one section ("老樣子") scored too low to retrieve. Each section
  // must stay its own focused chunk, never merged with unrelated ones.
  it('isolates a section so its fact is not diluted by other sections', () => {
    const doc = [
      '營業時間\n- 週二至週日 09:00–18:00\n- 週一公休',
      '隱藏菜單\n- 跟店員說「老樣子」可點到不在菜單上的「重焙曼特寧 Dirty」。',
      '訂位\n- 平日可訂位，週末現場候位。',
    ].join('\n\n');
    const chunks = chunkText(doc);
    expect(chunks.length).toBe(3);
    const hidden = chunks.find(c => c.includes('老樣子'));
    expect(hidden).toBeDefined();
    expect(hidden!.includes('營業時間')).toBe(false);
  });

  it('hard-splits a single section longer than maxChars', () => {
    const para = 'a'.repeat(2500);
    const chunks = chunkText(para, { maxChars: 1000, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000);
  });

  it('prefers a CJK sentence boundary when hard-splitting', () => {
    const a = `${'甲'.repeat(600)}。`;
    const b = `${'乙'.repeat(600)}。`;
    const chunks = chunkText(a + b, { maxChars: 900, overlap: 0 });
    expect(chunks[0]).toBe(a);
  });

  it('always makes progress (no infinite loop) on a huge section with large overlap', () => {
    const chunks = chunkText('a'.repeat(5000), { maxChars: 100, overlap: 500 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThan(5000);
  });
});
