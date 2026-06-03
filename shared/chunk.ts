// Splits knowledge-document text into overlapping chunks for embedding.
// Pure + dependency-free so it unit-tests without a runtime and runs in both
// Nitro and the Deno worker. Character-based rather than token-based: a real
// tokenizer is heavy to ship cross-runtime, and char count is a good-enough
// proxy for the granularity that matters here. Defaults suit mixed zh/en —
// ~1000 chars is roughly 1000 CJK tokens or ~250 English tokens, well under
// the embedding model's per-input limit, while staying small enough that a
// retrieved chunk is focused.

export const DEFAULT_MAX_CHARS = 1000;
export const DEFAULT_OVERLAP = 150;

export interface ChunkOptions {
  maxChars?: number;
  overlap?:  number;
}

// Sentence/paragraph enders we prefer to cut on (incl. CJW full-width), so a
// chunk rarely ends mid-sentence.
const BOUNDARY_CHARS = ['\n', '。', '！', '？', '!', '?', '.'];

export const chunkText = (raw: string, opts: ChunkOptions = {}): string[] => {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const overlap = opts.overlap ?? DEFAULT_OVERLAP;

  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);

    // Not the final chunk: pull `end` back to the last natural boundary in the
    // tail of the window (>= 60% in) so chunks break on sentences, not letters.
    // Fall back to the hard cut if no boundary is found in range.
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
    if (piece) chunks.push(piece);

    if (end >= text.length) break;
    // Step back by `overlap` to carry context across the seam; the max() keeps
    // progress even if overlap >= the chunk just emitted.
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
};
