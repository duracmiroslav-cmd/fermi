import type { SupabaseClient } from '@supabase/supabase-js';
import type { RateLimiter, UsageCounter } from './index.ts';
import { createPostgresRateLimiter, createPostgresUsageCounter } from './postgres.ts';
import { createUpstashRateLimiter, createUpstashUsageCounter } from './upstash.ts';

export interface CounterEnv {
  upstashUrl:   string | null;
  upstashToken: string | null;
}

// Upstash takes precedence when both env vars are set. Selecting per-
// instance (instead of globally) keeps tests free to construct either
// backend without process-env coupling.
export const createRateLimiter = (
  admin: SupabaseClient,
  env:   CounterEnv,
): RateLimiter => (
  env.upstashUrl && env.upstashToken
    ? createUpstashRateLimiter({ url: env.upstashUrl, token: env.upstashToken })
    : createPostgresRateLimiter(admin)
);

export const createUsageCounter = (
  admin: SupabaseClient,
  env:   CounterEnv,
): UsageCounter => (
  env.upstashUrl && env.upstashToken
    ? createUpstashUsageCounter({ url: env.upstashUrl, token: env.upstashToken })
    : createPostgresUsageCounter(admin)
);
