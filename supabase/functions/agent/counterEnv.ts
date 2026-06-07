// Binds Deno.env into the CounterEnv shape so rate-limit call sites import it
// from here without threading env through every call.
export const COUNTER_ENV = {
  upstashUrl:   Deno.env.get('UPSTASH_REDIS_REST_URL')   ?? null,
  upstashToken: Deno.env.get('UPSTASH_REDIS_REST_TOKEN') ?? null,
};
