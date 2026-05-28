import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimiter, UsageCounter } from '../../shared/counters';
import {
  createPostgresRateLimiter,
  createPostgresUsageCounter,
} from '../../shared/counters/postgres';
import {
  createUpstashRateLimiter,
  createUpstashUsageCounter,
} from '../../shared/counters/upstash';

// Each setup() returns a fresh impl over fresh state. Two impls are
// tested through the same contract describe to keep them lock-stepped:
// any new invariant added below must hold for both backends, by
// construction. Drift between backends used to cost an evening of
// "works on Upstash, fails on Postgres" debugging.

const setupPostgres = (): { usage: UsageCounter; limiter: RateLimiter } => {
  const counters = new Map<string, number>();
  const incr = (key: string): number => {
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return next;
  };
  const admin = {
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'incr_rate_limit_bucket') return Promise.resolve({ data: incr(args.bucket_key as string), error: null });
      if (name === 'consume_usage_quota') return Promise.resolve({ data: incr(args.quota_key as string), error: null });
      return Promise.resolve({ data: null, error: { message: `unknown rpc: ${name}` } });
    },
    from: () => ({
      select: () => ({
        eq: (_col: string, key: string) => ({
          maybeSingle: () => {
            const v = counters.get(key);
            return Promise.resolve({ data: v == null ? null : { count: v }, error: null });
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
  return {
    usage:   createPostgresUsageCounter(admin),
    limiter: createPostgresRateLimiter(admin),
  };
};

const setupUpstash = (): { usage: UsageCounter; limiter: RateLimiter } => {
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
      if (op === 'GET') {
        const v = counters.get(k);
        return { result: v == null ? null : String(v) };
      }
      return { result: null };
    });
    return Promise.resolve(new Response(JSON.stringify(replies), { status: 200 }));
  });
  return {
    usage:   createUpstashUsageCounter({ url: 'http://x', token: 't' }),
    limiter: createUpstashRateLimiter({ url: 'http://x', token: 't' }),
  };
};

const describeUsageCounter = (name: string, setup: () => UsageCounter): void => {
  describe(`${name} UsageCounter`, () => {
    let counter: UsageCounter;
    beforeEach(() => {
      counter = setup();
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });
    const bump = (key: string, cap: number): Promise<unknown> =>
      counter.consume({ key, cap, ttlSec: 60 });

    describe('consume', () => {
      it('returns count 1 on a fresh key', async () => {
        const r = await counter.consume({ key: 'k', cap: 5, ttlSec: 60 });
        expect(r.count).toBe(1);
      });

      it('increments across consecutive calls', async () => {
        await bump('k', 5);
        const r = await counter.consume({ key: 'k', cap: 5, ttlSec: 60 });
        expect(r.count).toBe(2);
      });

      it('flips allowed=false the first call past cap', async () => {
        await bump('k', 2);
        await bump('k', 2);
        const r = await counter.consume({ key: 'k', cap: 2, ttlSec: 60 });
        expect(r.allowed).toBe(false);
        expect(r.count).toBe(3);
      });

      it('keeps the count climbing past cap so the log can record overshoot', async () => {
        for (let i = 0; i < 5; i++) await bump('k', 2);
        const r = await counter.consume({ key: 'k', cap: 2, ttlSec: 60 });
        expect(r.count).toBe(6);
      });

      it('reports remaining as cap minus count, clamped to 0', async () => {
        const first = await counter.consume({ key: 'k', cap: 5, ttlSec: 60 });
        expect(first.remaining).toBe(4);
        for (let i = 0; i < 10; i++) await bump('k', 5);
        const past = await counter.consume({ key: 'k', cap: 5, ttlSec: 60 });
        expect(past.remaining).toBe(0);
      });
    });

    describe('peek', () => {
      it('returns 0 for an untouched key', async () => {
        expect(await counter.peek({ key: 'fresh' })).toBe(0);
      });

      it('returns the current count without incrementing', async () => {
        await bump('k', 5);
        await bump('k', 5);
        expect(await counter.peek({ key: 'k' })).toBe(2);
        expect(await counter.peek({ key: 'k' })).toBe(2);
        const r = await counter.consume({ key: 'k', cap: 5, ttlSec: 60 });
        expect(r.count).toBe(3);
      });
    });
  });
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

describeUsageCounter('Postgres', () => setupPostgres().usage);
describeUsageCounter('Upstash', () => setupUpstash().usage);
describeRateLimiter('Postgres', () => setupPostgres().limiter);
describeRateLimiter('Upstash', () => setupUpstash().limiter);
