import {
  KeyNotConfiguredError,
  resolveKey,
} from '../../../../shared/keys.ts';
import type { Tool } from './index.ts';

interface Args {
  query?: unknown;
  max_results?: unknown;
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyResponse {
  query: string;
  answer?: string;
  results: TavilyResult[];
}

// Snippet cap per result keeps the agent's message list compact , 
// 300 chars is enough for the model to judge relevance and decide
// whether to fetch the full page via a follow-up tool, without
// burning context on five paragraphs of marketing copy.
const SNIPPET_MAX_CHARS = 300;

export const searchWeb: Tool = {
  name: 'search_web',
  capabilitySlug: 'web-search',
  description:
    'Search the web for current information. Returns a brief AI-synthesized answer plus relevant URLs with short snippets. Use when you need facts that may have changed, recent news, or anything outside your training data.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query in natural language. Be specific.',
      },
      max_results: {
        type: 'integer',
        description: 'Number of results to return (1-10).',
        minimum: 1,
        maximum: 10,
        default: 5,
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  execute: async (rawArgs, ctx) => {
    // The key resolves from the owner's connected Tavily credential or the
    // deployment's TAVILY_API_KEY env. Errors round-trip back to the LLM as
    // tool-result JSON so the model can relay a sensible message in the
    // user's language rather than crashing the loop.
    let apiKey: string;
    try {
      const resolved = await resolveKey(ctx.admin, ctx.kek, {
        ownerId: ctx.ownerId,
        purpose: 'tavily',
        platformKey: Deno.env.get('TAVILY_API_KEY') ?? null,
      });
      apiKey = resolved.key;
    } catch (err) {
      if (err instanceof KeyNotConfiguredError) {
        return {
          error: 'search_web needs a Tavily API key, which this bot has not configured. Tell the user web search is not set up on this bot.',
        };
      }
      throw err;
    }

    const { query, max_results } = rawArgs as Args;
    if (typeof query !== 'string' || query.trim().length === 0) {
      return { error: 'search_web requires a non-empty `query` string.' };
    }

    const requested = typeof max_results === 'number' ? max_results : 5;
    const capped = Math.min(Math.max(requested, 1), 10);

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        max_results: capped,
        include_answer: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { error: `Tavily ${res.status}: ${body.slice(0, 200)}` };
    }

    const data: TavilyResponse = await res.json();
    return {
      answer: data.answer ?? null,
      results: data.results.map(r => ({
        title: r.title,
        url: r.url,
        snippet: (r.content ?? '').slice(0, SNIPPET_MAX_CHARS),
      })),
    };
  },
};
