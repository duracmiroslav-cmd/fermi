import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDisplayName } from '../../supabase/functions/agent/groupMembers';

interface MemberRow {
  bot_id:            string;
  external_group_id: string;
  external_user_id:  string;
  display_name:      string | null;
  cached_at:         string;
}

// In-memory group_members: select honours the three eq filters, upsert
// replaces by composite key. Lets the cache-hit / TTL / fallback paths be
// exercised against real query semantics.
const fakeAdmin = (rows: MemberRow[]): SupabaseClient => {
  const newBuilder = () => {
    const filters: Record<string, string> = {};
    const api = {
      select: () => api,
      eq:     (c: string, v: string) => {
        filters[c] = v;
        return api;
      },
      maybeSingle: () => {
        const found = rows.find(r =>
          r.bot_id === filters.bot_id
          && r.external_group_id === filters.external_group_id
          && r.external_user_id === filters.external_user_id);
        return Promise.resolve({
          data:  found ? { display_name: found.display_name, cached_at: found.cached_at } : null,
          error: null,
        });
      },
      upsert: (obj: MemberRow) => {
        const i = rows.findIndex(r =>
          r.bot_id === obj.bot_id
          && r.external_group_id === obj.external_group_id
          && r.external_user_id === obj.external_user_id);
        if (i >= 0) rows[i] = obj;
        else rows.push(obj);
        return Promise.resolve({ error: null });
      },
    };
    return api;
  };
  return { from: () => newBuilder() } as unknown as SupabaseClient;
};

const fresh = () => new Date().toISOString();
const stale = () => new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
const okProfile = (displayName: string) =>
  () => Promise.resolve(new Response(JSON.stringify({ displayName }), { status: 200 }));

afterEach(() => vi.unstubAllGlobals());

describe('resolveDisplayName', () => {
  it('returns the cached name within TTL without hitting LINE', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error('must not fetch on a fresh cache hit');
    });
    const admin = fakeAdmin([
      { bot_id: 'b', external_group_id: 'g', external_user_id: 'u', display_name: 'Alice', cached_at: fresh() },
    ]);
    expect(await resolveDisplayName(admin, 'tok', 'b', 'g', 'u')).toBe('Alice');
  });

  it('falls back to an opaque label when the cached name is null', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error('must not fetch on a fresh cache hit');
    });
    const admin = fakeAdmin([
      { bot_id: 'b', external_group_id: 'g', external_user_id: 'uABCD1234', display_name: null, cached_at: fresh() },
    ]);
    expect(await resolveDisplayName(admin, 'tok', 'b', 'g', 'uABCD1234')).toBe('[user_1234]');
  });

  it('fetches and caches on a cold miss', async () => {
    vi.stubGlobal('fetch', okProfile('Bob'));
    const rows: MemberRow[] = [];
    expect(await resolveDisplayName(fakeAdmin(rows), 'tok', 'b', 'g', 'u')).toBe('Bob');
    expect(rows).toHaveLength(1);
    expect(rows[0].display_name).toBe('Bob');
  });

  it('refetches when the cache is stale', async () => {
    vi.stubGlobal('fetch', okProfile('New'));
    const admin = fakeAdmin([
      { bot_id: 'b', external_group_id: 'g', external_user_id: 'u', display_name: 'Old', cached_at: stale() },
    ]);
    expect(await resolveDisplayName(admin, 'tok', 'b', 'g', 'u')).toBe('New');
  });

  it('caches a null name on a 404 and returns the fallback', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 404 })));
    const rows: MemberRow[] = [];
    expect(await resolveDisplayName(fakeAdmin(rows), 'tok', 'b', 'g', 'uZZZZ9999')).toBe('[user_9999]');
    expect(rows[0].display_name).toBeNull();
  });

  it('reuses a stale cached name when the profile fetch errors', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 500 })));
    const admin = fakeAdmin([
      { bot_id: 'b', external_group_id: 'g', external_user_id: 'u', display_name: 'Old', cached_at: stale() },
    ]);
    expect(await resolveDisplayName(admin, 'tok', 'b', 'g', 'u')).toBe('Old');
  });
});
