import type { SupabaseClient } from '@supabase/supabase-js';
import { MONTHLY_QUOTA, type Purpose, buildUsageQuotaKey } from './constants/limits.ts';
import type { Tier } from './constants/tiers.ts';
import { type CounterEnv, createUsageCounter } from './counters/factory.ts';

// 35 days covers any timezone slippage at the monthly boundary while
// still expiring abandoned Upstash keys eventually. Postgres impl
// ignores the ttl — old monthly rows linger as audit, sized at one
// row per (owner, purpose, month).
const MONTHLY_TTL_SEC = 35 * 24 * 3600;

export interface QuotaResult {
  allowed:   boolean;
  count:     number;
  remaining: number;
  cap:       number;
}

const resolveCap = async (
  admin:   SupabaseClient,
  ownerId: string,
  purpose: Purpose,
): Promise<number> => {
  const { data: user, error: userErr } = await admin
    .from('users')
    .select('tier')
    .eq('id', ownerId)
    .single();
  if (userErr) throw userErr;
  const tier = (user.tier as Tier) ?? 'free';
  return MONTHLY_QUOTA[purpose][tier];
};

// Atomic INCR + cap compare. Callers gate on `allowed`; the count
// keeps climbing past cap so the observability log can report "how
// far over they went". Tier resolved per-call (not cached) so a
// Free → Pro upgrade takes effect on the next quota check.
export const consumeQuota = async (
  admin: SupabaseClient,
  env:   CounterEnv,
  input: { ownerId: string; purpose: Purpose },
): Promise<QuotaResult> => {
  const cap = await resolveCap(admin, input.ownerId, input.purpose);
  const counter = createUsageCounter(admin, env);
  return await counter.consume({
    key:    buildUsageQuotaKey({ ownerId: input.ownerId, purpose: input.purpose }),
    cap,
    ttlSec: MONTHLY_TTL_SEC,
  });
};

// Read-only variant for the dashboard /usage page. Doesn't INCR.
export const peekQuota = async (
  admin: SupabaseClient,
  env:   CounterEnv,
  input: { ownerId: string; purpose: Purpose },
): Promise<QuotaResult> => {
  const cap = await resolveCap(admin, input.ownerId, input.purpose);
  const counter = createUsageCounter(admin, env);
  const count = await counter.peek({
    key: buildUsageQuotaKey({ ownerId: input.ownerId, purpose: input.purpose }),
  });
  return {
    allowed:   count <= cap,
    count,
    remaining: Math.max(0, cap - count),
    cap,
  };
};
