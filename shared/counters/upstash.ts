import type {
  ConsumeQuotaInput,
  ConsumeQuotaResult,
  RateLimitCheckInput,
  RateLimitCheckResult,
  RateLimiter,
  UsageCounter,
} from './index.ts';

export interface UpstashConfig {
  url:   string;
  token: string;
}

interface PipelineReply { result: unknown }

// EXPIRE ... NX is load-bearing: without it every INCR would refresh
// the TTL and fixed windows would never roll over. Setting TTL only
// on the first INSERT keeps each bucket scoped to its time slice.
const incrWithTtl = async (
  config: UpstashConfig,
  key:    string,
  ttlSec: number,
): Promise<number> => {
  const reply = await pipelineFetch(config, [
    ['INCR',   key],
    ['EXPIRE', key, ttlSec, 'NX'],
  ]);
  return Number(reply[0]?.result ?? 0);
};

const pipelineFetch = async (
  config:   UpstashConfig,
  commands: (string | number)[][],
): Promise<PipelineReply[]> => {
  const res = await fetch(`${config.url}/pipeline`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upstash pipeline ${res.status}: ${body}`);
  }
  return await res.json() as PipelineReply[];
};

export const createUpstashRateLimiter = (config: UpstashConfig): RateLimiter => ({
  async check(input: RateLimitCheckInput): Promise<RateLimitCheckResult> {
    const results = await Promise.all(
      input.windows.map(async (window) => {
        const count = await incrWithTtl(config, window.key, window.ttlSec);
        return { window, count };
      }),
    );

    const counts: Record<string, number> = {};
    let blockingWindow: RateLimitCheckResult['blockingWindow'];
    for (const { window, count } of results) {
      counts[window.key] = count;
      if (count > window.cap && !blockingWindow) {
        blockingWindow = { key: window.key, cap: window.cap, count };
      }
    }
    return { blocked: blockingWindow !== undefined, blockingWindow, counts };
  },
});

export const createUpstashUsageCounter = (config: UpstashConfig): UsageCounter => ({
  async consume(input: ConsumeQuotaInput): Promise<ConsumeQuotaResult> {
    const count = await incrWithTtl(config, input.key, input.ttlSec);
    return {
      allowed:   count <= input.cap,
      count,
      remaining: Math.max(0, input.cap - count),
      cap:       input.cap,
    };
  },

  async peek({ key }: { key: string }): Promise<number> {
    const reply = await pipelineFetch(config, [['GET', key]]);
    const raw = reply[0]?.result;
    return raw == null ? 0 : Number(raw);
  },
});
