import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { consumeQuota, peekQuota } from '../../shared/quota';

// resolveCap reads users.tier on every call (no cache). These tests
// lock that invariant — a Free → Pro upgrade must reflect on the next
// quota check, not on the next deploy or session. Postgres backend
// chosen (env: both null) so no fetch stub is needed.

const ENV_POSTGRES = { upstashUrl: null, upstashToken: null };
const owner = '00000000-0000-0000-0000-000000000001';

const setupAdmin = (tierProvider: () => string | null): {
  admin:   SupabaseClient;
  tierSpy: ReturnType<typeof vi.fn>;
} => {
  const counts = new Map<string, number>();
  const tierSpy = vi.fn(() =>
    Promise.resolve({ data: { tier: tierProvider() }, error: null }),
  );

  const admin = {
    from: (table: string) => {
      if (table === 'users') {
        return { select: () => ({ eq: () => ({ single: tierSpy }) }) };
      }
      return {
        select: () => ({
          eq: (_col: string, key: string) => ({
            maybeSingle: () => {
              const v = counts.get(key);
              return Promise.resolve({
                data:  v == null ? null : { count: v },
                error: null,
              });
            },
          }),
        }),
      };
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'consume_usage_quota') {
        const k = args.quota_key as string;
        const next = (counts.get(k) ?? 0) + 1;
        counts.set(k, next);
        return Promise.resolve({ data: next, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unknown rpc: ${name}` } });
    },
  } as unknown as SupabaseClient;

  return { admin, tierSpy };
};

describe('consumeQuota', () => {
  it('uses the Free cap for free-tier owners', async () => {
    const { admin } = setupAdmin(() => 'free');
    const r = await consumeQuota(admin, ENV_POSTGRES, { ownerId: owner, purpose: 'image_gen' });
    expect(r.cap).toBe(10);
  });

  it('uses the Pro cap for pro-tier owners', async () => {
    const { admin } = setupAdmin(() => 'pro');
    const r = await consumeQuota(admin, ENV_POSTGRES, { ownerId: owner, purpose: 'image_gen' });
    expect(r.cap).toBe(200);
  });

  it('defaults to the Free cap when tier is missing', async () => {
    const { admin } = setupAdmin(() => null);
    const r = await consumeQuota(admin, ENV_POSTGRES, { ownerId: owner, purpose: 'image_gen' });
    expect(r.cap).toBe(10);
  });

  it('re-reads tier on every call', async () => {
    let currentTier = 'free';
    const { admin, tierSpy } = setupAdmin(() => currentTier);

    const free = await consumeQuota(admin, ENV_POSTGRES, { ownerId: owner, purpose: 'image_gen' });
    expect(free.cap).toBe(10);

    currentTier = 'pro';
    const pro = await consumeQuota(admin, ENV_POSTGRES, { ownerId: owner, purpose: 'image_gen' });
    expect(pro.cap).toBe(200);

    expect(tierSpy).toHaveBeenCalledTimes(2);
  });
});

describe('peekQuota', () => {
  it('re-reads tier on every call', async () => {
    let currentTier = 'free';
    const { admin, tierSpy } = setupAdmin(() => currentTier);

    const free = await peekQuota(admin, ENV_POSTGRES, { ownerId: owner, purpose: 'image_gen' });
    expect(free.cap).toBe(10);

    currentTier = 'pro';
    const pro = await peekQuota(admin, ENV_POSTGRES, { ownerId: owner, purpose: 'image_gen' });
    expect(pro.cap).toBe(200);

    expect(tierSpy).toHaveBeenCalledTimes(2);
  });
});
