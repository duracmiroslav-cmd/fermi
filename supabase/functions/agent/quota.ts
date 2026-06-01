// Binds Deno.env into the CounterEnv shape so call sites import quota
// helpers from here without threading env through every call.

export { consumeQuota, peekQuota, type QuotaResult } from '../../../shared/quota.ts';

export const COUNTER_ENV = {
  upstashUrl:   Deno.env.get('UPSTASH_REDIS_REST_URL')   ?? null,
  upstashToken: Deno.env.get('UPSTASH_REDIS_REST_TOKEN') ?? null,
};
