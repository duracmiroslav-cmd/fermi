// Splits knowledge-document text into chunks for embedding. Pure +
// dependency-free so it unit-tests without a runtime and runs in both Nitro
// and the Deno worker.
//
// Paragraph-first: split on blank lines and emit one chunk per paragraph
// (section). This keeps each chunk topically focused — critical because an
// embedding is one averaged vector, so a chunk mixing many topics retrieves
// poorly for a query about just one of them (measured: a focused "hidden
// menu" section scored ~0.26 for its query vs ~0.15 when the whole document
// was a single chunk). Deliberately NOT greedily packed up to `maxChars`:
// packing would re-merge a small structured doc back into one diluted chunk.
// A section longer than `maxChars` falls back to a character split with
// overlap. (Unstructured text with no blank lines is one chunk; the retrieval
// tool's low similarity floor is the safety net there.)
//
// Char-based sizing (not tokens): a real tokenizer is heavy to ship
// cross-runtime, and char count is a good-enough proxy. ~600 chars is roughly
// 600 CJK tokens / ~150 English tokens — the cap before a section is split.

export const DEFAULT_MAX_CHARS = 600;
export const DEFAULT_OVERLAP = 100;

export interface ChunkOptions {
  maxChars?: number;
  overlap?:  number;
}

// Sentence/paragraph enders (incl. full-width CJK) preferred as cut points
// when a single paragraph must be hard-split.
const BOUNDARY_CHARS = ['\n', '。', '！', '？', '!', '?', '.'];

// Character split with overlap for a run of text that has no blank-line
// structure to exploit (a single oversized paragraph).
const hardSplit = (text: string, maxChars: number, overlap: number): string[] => {
  if (text.length <= maxChars) return [text];

  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const minBreak = start + Math.floor(maxChars * 0.6);
      let breakAt = -1;
      for (const ch of BOUNDARY_CHARS) {
        const idx = text.lastIndexOf(ch, end - 1);
        if (idx >= minBreak && idx > breakAt) breakAt = idx;
      }
      if (breakAt !== -1) end = breakAt + 1;
    }
    const piece = text.slice(start, end).trim();
    if (piece) out.push(piece);
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out;
};

export const chunkText = (raw: string, opts: ChunkOptions = {}): string[] => {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const overlap = opts.overlap ?? DEFAULT_OVERLAP;

  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  // Blank line (one or more, with optional intervening whitespace) separates
  // paragraphs/sections. One chunk each; oversized sections are hard-split.
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

  const chunks: string[] = [];
  for (const para of paragraphs) {
    if (para.length > maxChars) chunks.push(...hardSplit(para, maxChars, overlap));
    else chunks.push(para);
  }
  return chunks;
};
