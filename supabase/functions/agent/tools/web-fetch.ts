import {
  FreeBYOKRequiredError,
  PlatformKeyNotConfiguredError,
  resolveKey,
} from '../../../../shared/keys.ts';
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
// Generous vs search snippets (300) since the point here is to read a body.
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
      if (err instanceof FreeBYOKRequiredError || err instanceof PlatformKeyNotConfiguredError) {
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
// server-side fetch is an SSRF vector: restrict scheme to http(s), block
// private/loopback/link-local hosts (incl. the cloud metadata IP), and
// re-validate every redirect hop (a public URL can 30x into the internal
// network). DNS-rebinding is only partially mitigated.

const isPrivateIpv4 = (ip: string): boolean => {
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some(n => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = o;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;            // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT
  return false;
};

const isBlockedHost = (host: string): boolean => {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === 'metadata.google.internal') return true;
  if (h.includes(':')) {                              // IPv6 literal
    if (h === '::1') return true;
    if (h.startsWith('fc') || h.startsWith('fd')) return true;  // ULA fc00::/7
    if (h.startsWith('fe80')) return true;            // link-local
    if (h.startsWith('::ffff:')) return isPrivateIpv4(h.slice(7));
    return false;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return isPrivateIpv4(h);
  return false;
};

const assertSafeHost = async (host: string): Promise<void> => {
  if (isBlockedHost(host)) throw new Error(`Blocked host: ${host}`);
  let ips: string[] = [];
  try {
    ips = await Deno.resolveDns(host, 'A');
  } catch {
    return; // resolveDns unavailable/failed: rely on literal + redirect guard
  }
  if (ips.some(isPrivateIpv4)) throw new Error(`Host resolves to private IP: ${host}`);
};

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

const readCapped = async (res: Response, maxBytes: number): Promise<string> => {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let out = '';
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    out += decoder.decode(value, { stream: true });
    if (total >= maxBytes) { await reader.cancel(); break; }
  }
  return out;
};

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 2_000_000;

const directProvider: FetchProvider = {
  name: 'direct',
  extract: async (url) => {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const u = new URL(current);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error(`Unsupported protocol: ${u.protocol}`);
      }
      await assertSafeHost(u.hostname);

      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'fermi-web-fetch/1.0', 'Accept': 'text/html,text/plain' },
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        await res.body?.cancel();
        if (!loc) return null;
        current = new URL(loc, current).toString(); // re-validated at loop top
        continue;
      }

      if (!res.ok) { await res.body?.cancel(); return null; }

      const ct = res.headers.get('content-type') ?? '';
      if (ct && !/(text\/|html|xml|json)/i.test(ct)) {
        await res.body?.cancel();
        throw new Error(`Unsupported content type: ${ct}`);
      }

      const { title, text } = htmlToText(await readCapped(res, MAX_BYTES));
      if (!text) return null;
      return { title, text: text.slice(0, MAX_CHARS) };
    }
    throw new Error('Too many redirects');
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
