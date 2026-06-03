import type { Tool } from './index.ts';
import { embedTexts, toVectorLiteral } from '../../../../shared/embeddings.ts';

interface Args {
  query?: unknown;
}

// Top-k chunks to return, and the cosine-similarity floor below which a hit
// is treated as noise. text-embedding-3-small puts related passages around
// 0.3+ and unrelated ones near 0, so ~0.25 separates "nothing relevant" (let
// the model say it doesn't know) from a real match. Tunable once we see real
// query distributions.
const MATCH_COUNT = 6;
const MIN_SIMILARITY = 0.25;
// Cap each returned passage so a few long chunks can't dominate the context.
const PASSAGE_MAX_CHARS = 800;

export const searchKnowledge: Tool = {
  name: 'search_knowledge',
  capabilitySlug: 'knowledge-base',
  description:
    'Search the operator-provided knowledge base for this assistant. Use this BEFORE answering any question that might be covered by the operator\'s own material (products, prices, hours, policies, FAQs, background). Returns the most relevant passages. If nothing relevant comes back, tell the user you don\'t have that information rather than guessing.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What to look up, in natural language. Use the user\'s own wording.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  execute: async (rawArgs, ctx) => {
    const { query } = rawArgs as Args;
    if (typeof query !== 'string' || query.trim().length === 0) {
      return { error: 'search_knowledge requires a non-empty `query` string.' };
    }

    // Knowledge base is Pro-only; embedding runs on fermi's platform OpenAI
    // key (the same key used for TTS/STT), never the owner's BYOK.
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return { error: 'search_knowledge is temporarily unavailable: the embedding backend is not configured.' };
    }

    let embedding: number[];
    try {
      [embedding] = await embedTexts([query], apiKey);
    } catch (err) {
      return { error: `search_knowledge could not embed the query: ${String(err)}` };
    }

    const { data, error } = await ctx.admin.rpc('match_knowledge_chunks', {
      p_agent_id:        ctx.agentId,
      p_query_embedding: toVectorLiteral(embedding),
      p_match_count:     MATCH_COUNT,
      p_min_similarity:  MIN_SIMILARITY,
    });
    if (error) return { error: `search_knowledge query failed: ${error.message}` };

    const passages = (data ?? [] as Array<{ content: string }>)
      .map((r: { content: string }) => r.content.slice(0, PASSAGE_MAX_CHARS));
    if (passages.length === 0) {
      return { passages: [], note: 'No matching information found in this assistant\'s knowledge base.' };
    }
    return { passages };
  },
};
