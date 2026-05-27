import type { SupabaseClient } from '@supabase/supabase-js';
import { RATE_WINDOWS, rateLimitKey, type RateWindow } from '~~/shared/constants/limits';
import { createRateLimiter, type CounterEnv } from '~~/shared/counters/factory';

export interface RateLimitOutcome {
  allowed: boolean;
  // Which window first crossed its cap, if any. Surfaced into the
  // structured log line so we can tell whether bursts (minute), pace
  // evasion (hour), or volume (day) is the dominant block reason.
  blockingScope?: RateWindow['scope'];
  // All windows' post-INCR counts, useful for "close to cap" trend
  // observation even when no block fired.
  counts: Record<string, number>;
}

// Checks all RATE_WINDOWS in parallel for a (bot, external user) pair.
// All windows INCR regardless of outcome — first cross wins the
// blocking label but every window's count is recorded for the log.
export const checkBotUserRateLimit = async (
  admin: SupabaseClient,
  env:   CounterEnv,
  input: { botId: string; externalUserId: string },
): Promise<RateLimitOutcome> => {
  const limiter = createRateLimiter(admin, env);

  const windowsWithScope = RATE_WINDOWS.map(w => ({
    scope:  w.scope,
    key:    rateLimitKey({ botId: input.botId, externalUserId: input.externalUserId, window: w }),
    ttlSec: w.ttlSec,
    cap:    w.cap,
  }));

  const result = await limiter.check({ windows: windowsWithScope });
  if (!result.blocked) return { allowed: true, counts: result.counts };

  const blockingScope = windowsWithScope.find(w => w.key === result.blockingWindow?.key)?.scope;
  return { allowed: false, blockingScope, counts: result.counts };
};
