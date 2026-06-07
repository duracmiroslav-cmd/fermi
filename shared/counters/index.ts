// Rate-limit counter abstraction. Two impls plug in via factory:
//   Upstash REST  → used when UPSTASH_REDIS_* env is set
//   Postgres RPC  → fallback (no Redis dependency)
// Factory in `./factory.ts` picks by env presence — adding a new
// backend = one new impl file + one branch in the factory, no caller
// edits.

export interface RateLimitCheckInput {
  // Multiple windows checked in a single call. All windows INCR even
  // when one blocks (uniform state across windows simplifies the
  // observation log: every window's count is recorded regardless of
  // which one tripped).
  windows: { key: string; ttlSec: number; cap: number }[];
}

export interface RateLimitCheckResult {
  blocked:         boolean;
  // First window that crossed its cap, if any. Same shape as the input
  // window plus the observed count, useful for the structured warn log.
  blockingWindow?: { key: string; cap: number; count: number };
  // All window counts after INCR, keyed by the window's `key`. Lets
  // the observation log surface "user is at 28/30 minute, 195/200
  // hour" even when blocking was avoided.
  counts:          Record<string, number>;
}

export interface RateLimiter {
  check(input: RateLimitCheckInput): Promise<RateLimitCheckResult>;
}
