// Worker-side adapter for shared/quota.ts: binds Deno.env into the
// CounterEnv shape and re-exports the rest. Call sites import from
// here so they don't have to thread env through every consumeQuota
// call.

export { consumeQuota, peekQuota, type QuotaResult } from '../../../shared/quota.ts';

export const COUNTER_ENV = {
  upstashUrl:   Deno.env.get('UPSTASH_REDIS_REST_URL')   ?? null,
  upstashToken: Deno.env.get('UPSTASH_REDIS_REST_TOKEN') ?? null,
};
