import {
  FreeByokRequiredError,
  PlatformKeyNotConfiguredError,
  resolveKey,
} from '../../../../shared/keys.ts';
import { safeFetch } from './safe-http.ts';
import type { Tool, ToolContext } from './index.ts';

// A fetch backend. Returns null when it can't service the request (e.g.
// no Tavily key for this tier), so the next provider in the chain gets a
// turn. Throws on a hard failure (network/parse/blocked host), which the
// chain also treats as "try the next one".
interface FetchProvider {
  name: string;
  extract: (url: string, ctx: ToolContext) => Promise<{ title?: string; text: string } | null>;
}

// Page text is capped so a single fetch can't swamp the model's context.
const MAX_CHARS = 8000;

// ---- Provider 1: Tavily Extract --------------------------------------------
// Reuses the owner's Tavily credential (same key + tier policy as search_web,
// via shared resolveKey). Tavily fetches the page itself, so this path carries
// no SSRF exposure on our infra and returns already-clean text. When the tier
// can't supply a key it returns null, degrading to the direct fetch below.

const tavilyProvider: FetchProvider = {
  name: 'tavily',
  extract: async (url, ctx) => {
    let apiKey: string;
    try {
      const resolved = await resolveKey(ctx.admin, ctx.kek, {
        ownerId: ctx.ownerId,
        purpose: 'tavily',
        platformKey: Deno.env.get('TAVILY_API_KEY') ?? null,
      });
      apiKey = resolved.key;
    } catch (err) {
      // No Tavily for this tier (Free without BYOK, or Pro with no platform
      // key): fall through to the direct provider rather than failing.
      if (err instanceof FreeByokRequiredError || err instanceof PlatformKeyNotConfiguredError) {
        return null;
      }
      throw err;
    }

    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, urls: [url] }),
    });
    if (!res.ok) return null;

    const data = await res.json() as { results?: { raw_content?: string }[] };
    const raw = data.results?.[0]?.raw_content?.trim();
    if (!raw) return null;
    return { text: raw.slice(0, MAX_CHARS) };
  },
};

// ---- Provider 2: direct fetch ----------------------------------------------
// Provider-independent fallback. Because the URL comes from the model, a
// server-side fetch is an SSRF vector: every connection goes through
// safeFetch, which resolves A+AAAA, blocks private ranges, and pins the
// validated IP at socket-open time so a TTL=0 DNS-rebinding race between
// check and connect can't redirect the bytes into the internal network.
// Cert chain still binds to the original hostname via TLS serverName.

const htmlToText = (html: string): { title?: string; text: string } => {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return { title: titleMatch?.[1]?.trim() || undefined, text };
};

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 2_000_000;

const directProvider: FetchProvider = {
  name: 'direct',
  extract: async (url) => {
    const result = await safeFetch(url, {
      maxBytes:     MAX_BYTES,
      timeoutMs:    FETCH_TIMEOUT_MS,
      maxRedirects: MAX_REDIRECTS,
    });
    if (result.status < 200 || result.status >= 300) return null;
    if (result.contentType && !/(text\/|html|xml|json)/i.test(result.contentType)) {
      throw new Error(`Unsupported content type: ${result.contentType}`);
    }
    const { title, text } = htmlToText(result.body);
    if (!text) return null;
    return { title, text: text.slice(0, MAX_CHARS) };
  },
};

// ---- Tool ------------------------------------------------------------------
// Tavily-preferred (clean text, no SSRF), direct fetch as the
// provider-independent fallback when no Tavily key is available or it fails.

const providers: FetchProvider[] = [tavilyProvider, directProvider];

export const fetchWeb: Tool = {
  name: 'fetch_web',
  capabilitySlug: 'web-fetch',
  description:
    'Fetch and return the readable text content of a specific web page URL. Use after search_web returns a promising link, or when the user supplies a URL directly.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The full URL to fetch. Must start with http:// or https://.',
      },
    },
    required: ['url'],
    additionalProperties: false,
  },
  execute: async (rawArgs, ctx) => {
    const { url } = rawArgs as { url?: unknown };
    if (typeof url !== 'string' || url.trim().length === 0) {
      return { error: 'fetch_web requires a non-empty `url` string.' };
    }
    try {
      new URL(url);
    } catch {
      return { error: `fetch_web received an invalid URL: ${url}` };
    }

    for (const provider of providers) {
      try {
        const result = await provider.extract(url, ctx);
        if (result) {
          return { source: provider.name, title: result.title ?? null, text: result.text };
        }
      } catch {
        // Provider failed (blocked host, network); try the next.
      }
    }
    return { error: `fetch_web could not retrieve readable content from ${url}.` };
  },
};
