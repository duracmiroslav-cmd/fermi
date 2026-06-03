// OpenAI text embeddings, shared across runtimes (Nitro ingestion + the
// Deno worker's knowledge-search tool). Plain fetch only, no runtime-specific
// imports. Uses the platform OpenAI key — the same key already held for
// TTS/STT, since OpenRouter doesn't expose an embeddings endpoint.
//
// `text-embedding-3-small` is multilingual (good Traditional-Chinese recall)
// and cheap (~$0.02/1M tokens). 1536 dims is baked into the
// `knowledge_chunks.embedding vector(1536)` column — changing the model
// means a migration + a full re-embed (vectors aren't comparable across
// models).

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIM = 1536;

const EMBEDDINGS_ENDPOINT = 'https://api.openai.com/v1/embeddings';

export class EmbeddingError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

// Embeds a batch of texts in one API call, preserving input order. OpenAI
// caps a request at 2048 inputs and 8191 tokens per input; callers chunk
// upstream and batch within those limits.
export const embedTexts = async (texts: string[], apiKey: string): Promise<number[][]> => {
  if (texts.length === 0) return [];

  const res = await fetch(EMBEDDINGS_ENDPOINT, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new EmbeddingError(res.status, `OpenAI embeddings failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const json = await res.json() as { data: Array<{ embedding: number[]; index: number }> };
  // OpenAI returns results indexed to input position; sort defensively so a
  // chunk's vector can never be misaligned with its text.
  return json.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding);
};

// pgvector text literal, e.g. "[0.1,0.2,...]". The `embedding` column and the
// `match_knowledge_chunks` query arg both type as `string` in the generated
// DB types (pgvector's wire form), so embeddings cross the supabase-js
// boundary as this literal, not as a JS number[].
export const toVectorLiteral = (embedding: number[]): string => `[${embedding.join(',')}]`;
