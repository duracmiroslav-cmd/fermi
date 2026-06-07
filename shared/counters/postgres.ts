import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  RateLimitCheckInput,
  RateLimitCheckResult,
  RateLimiter,
} from './index.ts';

export const createPostgresRateLimiter = (admin: SupabaseClient): RateLimiter => ({
  async check(input: RateLimitCheckInput): Promise<RateLimitCheckResult> {
    // Each window is an independent atomic INCR, so the RPCs run in
    // parallel.
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
