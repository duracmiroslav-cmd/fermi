import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ConsumeQuotaInput,
  ConsumeQuotaResult,
  RateLimitCheckInput,
  RateLimitCheckResult,
  RateLimiter,
  UsageCounter,
} from './index.ts';

export const createPostgresRateLimiter = (admin: SupabaseClient): RateLimiter => ({
  async check(input: RateLimitCheckInput): Promise<RateLimitCheckResult> {
    // Parallel RPCs: each window is an independent atomic INCR. Three
    // round-trips become one wall-clock period instead of three.
    const results = await Promise.all(
      input.windows.map(async (window) => {
        const { data, error: incrErr } = await admin.rpc('incr_rate_limit_bucket', {
          bucket_key: window.key,
          ttl_sec:    window.ttlSec,
        });
        if (incrErr) throw incrErr;
        return { window, count: data as number };
      }),
    );

    const counts: Record<string, number> = {};
    let blockingWindow: RateLimitCheckResult['blockingWindow'];
    for (const { window, count } of results) {
      counts[window.key] = count;
      // First crossed window wins the "blocking" label; subsequent
      // crosses are still reflected in counts for the log.
      if (count > window.cap && !blockingWindow) {
        blockingWindow = { key: window.key, cap: window.cap, count };
      }
    }

    return { blocked: blockingWindow !== undefined, blockingWindow, counts };
  },
});

export const createPostgresUsageCounter = (admin: SupabaseClient): UsageCounter => ({
  async consume(input: ConsumeQuotaInput): Promise<ConsumeQuotaResult> {
    // ttlSec is unused for usage_counters: period is encoded in the
    // key suffix (YYYY-MM). Rolling into a new month creates a fresh
    // row instead of mutating an expiring one.
    const { data, error: rpcErr } = await admin.rpc('consume_usage_quota', {
      quota_key: input.key,
    });
    if (rpcErr) throw rpcErr;
    const count = Number(data ?? 0);
    return {
      allowed:   count <= input.cap,
      count,
      remaining: Math.max(0, input.cap - count),
      cap:       input.cap,
    };
  },

  async peek({ key }: { key: string }): Promise<number> {
    const { data: row, error: rowErr } = await admin
      .from('usage_counters')
      .select('count')
      .eq('key', key)
      .maybeSingle();
    if (rowErr) throw rowErr;
    return Number(row?.count ?? 0);
  },
});
