// Counter abstraction. Two impls plug in via factory:
//   Upstash REST  → production (fermi Cloud)
//   Postgres RPC  → self-host fallback (no Redis dependency)
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

export interface ConsumeQuotaInput {
  key:    string;
  cap:    number;
  // TTL on first write. Subsequent INCRs don't extend; the key dies
  // naturally at the period boundary. 35 days for monthly keys covers
  // any timezone-vs-UTC slippage at the boundary.
  ttlSec: number;
}

export interface ConsumeQuotaResult {
  // True iff post-INCR count <= cap. count keeps climbing past cap so
  // the observability log can report "how far over they went".
  allowed:   boolean;
  count:     number;
  remaining: number;
  cap:       number;
}

export interface UsageCounter {
  consume(input: ConsumeQuotaInput): Promise<ConsumeQuotaResult>;
  // Read without incrementing. Dashboard /usage page calls this for
  // all 5 purposes per page load; impl should be cheap.
  peek(input: { key: string }): Promise<number>;
}
