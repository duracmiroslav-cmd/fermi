import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimiter } from '../../shared/counters';
import { createPostgresRateLimiter } from '../../shared/counters/postgres';
import { createUpstashRateLimiter } from '../../shared/counters/upstash';

// Each setup() returns a fresh impl over fresh state. Two impls are
// tested through the same contract describe to keep them lock-stepped:
// any new invariant added below must hold for both backends, by
// construction.

const setupPostgres = (): RateLimiter => {
  const counters = new Map<string, number>();
  const incr = (key: string): number => {
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return next;
  };
  const admin = {
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'incr_rate_limit_bucket') return Promise.resolve({ data: incr(args.bucket_key as string), error: null });
      return Promise.resolve({ data: null, error: { message: `unknown rpc: ${name}` } });
    },
  } as unknown as SupabaseClient;
  return createPostgresRateLimiter(admin);
};

const setupUpstash = (): RateLimiter => {
  const counters = new Map<string, number>();
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as (string | number)[][];
    const replies = body.map(([op, key]) => {
      const k = key as string;
      if (op === 'INCR') {
        const next = (counters.get(k) ?? 0) + 1;
        counters.set(k, next);
        return { result: next };
      }
      if (op === 'EXPIRE') return { result: 1 };
      return { result: null };
    });
    return Promise.resolve(new Response(JSON.stringify(replies), { status: 200 }));
  });
  return createUpstashRateLimiter({ url: 'http://x', token: 't' });
};

const describeRateLimiter = (name: string, setup: () => RateLimiter): void => {
  describe(`${name} RateLimiter`, () => {
    let limiter: RateLimiter;
    beforeEach(() => {
      limiter = setup();
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const wins = (...defs: { key: string; cap: number }[]) =>
      defs.map(d => ({ ...d, ttlSec: 60 }));

    it('returns blocked=false when every window is under cap', async () => {
      const r = await limiter.check({ windows: wins({ key: 'a', cap: 5 }) });
      expect(r.blocked).toBe(false);
      expect(r.counts.a).toBe(1);
    });

    it('increments every window on every call, regardless of blocking', async () => {
      const windows = wins({ key: 'a', cap: 2 }, { key: 'b', cap: 100 });
      for (let i = 0; i < 4; i++) await limiter.check({ windows });
      const r = await limiter.check({ windows });
      expect(r.blocked).toBe(true);
      expect(r.counts.a).toBe(5);
      expect(r.counts.b).toBe(5);
    });

    it('labels blockingWindow as the first input-order window to cross cap', async () => {
      const windows = wins({ key: 'a', cap: 2 }, { key: 'b', cap: 2 });
      for (let i = 0; i < 3; i++) await limiter.check({ windows });
      const r = await limiter.check({ windows });
      expect(r.blockingWindow?.key).toBe('a');
    });

    it('keeps every count climbing past cap so the log can record overshoot', async () => {
      const windows = wins({ key: 'a', cap: 2 });
      for (let i = 0; i < 5; i++) await limiter.check({ windows });
      const r = await limiter.check({ windows });
      expect(r.counts.a).toBe(6);
    });
  });
};

describeRateLimiter('Postgres', setupPostgres);
describeRateLimiter('Upstash', setupUpstash);
