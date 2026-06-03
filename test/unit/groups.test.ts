import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { activateGroup, ensureGroup, getGroup, markGroupLeft } from '../../supabase/functions/agent/groups';

// Faithful in-memory `groups` table: `.eq()` filters genuinely constrain
// which rows a select/update touches, so cross-group isolation and the
// pending→activated CAS are tested against real query semantics rather
// than canned responses. Mirrors the fake-admin approach in counters.test.ts.

interface Row {
  id:                string;
  bot_id:            string;
  external_group_id: string;
  status:            string;
  activated_at:      string | null;
}

const fakeAdmin = (rows: Row[]): SupabaseClient => {
  const newBuilder = () => {
    let op: 'select' | 'insert' | 'update' = 'select';
    let payload: Record<string, unknown> = {};
    const filters: [string, unknown][] = [];

    const match = (r: Row) => filters.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v);

    const exec = (): { data: unknown; error: { code?: string } | null } => {
      if (op === 'insert') {
        const dup = rows.some(r => r.bot_id === payload.bot_id && r.external_group_id === payload.external_group_id);
        if (dup) return { data: null, error: { code: '23505' } };
        const row: Row = {
          id:                randomUUID(),
          bot_id:            payload.bot_id as string,
          external_group_id: payload.external_group_id as string,
          status:            'pending',
          activated_at:      null,
        };
        rows.push(row);
        return { data: { id: row.id, status: row.status }, error: null };
      }
      const matched = rows.filter(match);
      if (op === 'update') {
        for (const r of matched) Object.assign(r, payload);
      }
      return { data: matched.map(r => ({ id: r.id, status: r.status })), error: null };
    };

    const api = {
      select: () => api,
      insert: (obj: Record<string, unknown>) => {
        op = 'insert';
        payload = obj;
        return api;
      },
      update: (obj: Record<string, unknown>) => {
        op = 'update';
        payload = obj;
        return api;
      },
      eq: (c: string, v: unknown) => {
        filters.push([c, v]);
        return api;
      },
      maybeSingle: () => {
        const { data, error } = exec();
        const arr = data as { id: string; status: string }[] | null;
        return Promise.resolve({ data: arr && arr.length ? arr[0] : null, error });
      },
      single: () => Promise.resolve(exec()),
      then:   (resolve: (v: { data: unknown; error: unknown }) => unknown) => resolve(exec()),
    };
    return api;
  };
  return { from: () => newBuilder() } as unknown as SupabaseClient;
};

const BOT = 'bot-1';

describe('groups data layer', () => {
  it('getGroup returns null when absent, the row when present', async () => {
    const admin = fakeAdmin([
      { id: 'g1', bot_id: BOT, external_group_id: 'G_A', status: 'pending', activated_at: null },
    ]);
    expect(await getGroup(admin, BOT, 'G_MISSING')).toBeNull();
    expect(await getGroup(admin, BOT, 'G_A')).toEqual({ id: 'g1', status: 'pending' });
  });

  it('ensureGroup lazily creates one pending row, idempotent on repeat', async () => {
    const rows: Row[] = [];
    const admin = fakeAdmin(rows);

    const first = await ensureGroup(admin, BOT, 'G_A');
    expect(first.status).toBe('pending');
    expect(rows).toHaveLength(1);

    const second = await ensureGroup(admin, BOT, 'G_A');
    expect(second.id).toBe(first.id);
    expect(rows).toHaveLength(1);
  });

  it('activateGroup is a pending→activated CAS: true once, then false', async () => {
    const admin = fakeAdmin([
      { id: 'g1', bot_id: BOT, external_group_id: 'G_A', status: 'pending', activated_at: null },
    ]);
    expect(await activateGroup(admin, BOT, 'G_A')).toBe(true);
    expect((await getGroup(admin, BOT, 'G_A'))?.status).toBe('activated');
    // Second entry of the same code is a no-op transition.
    expect(await activateGroup(admin, BOT, 'G_A')).toBe(false);
  });

  it('activateGroup touches only the named group (cross-group isolation)', async () => {
    const admin = fakeAdmin([
      { id: 'g1', bot_id: BOT, external_group_id: 'G_A', status: 'pending', activated_at: null },
      { id: 'g2', bot_id: BOT, external_group_id: 'G_B', status: 'pending', activated_at: null },
    ]);
    await activateGroup(admin, BOT, 'G_A');
    expect((await getGroup(admin, BOT, 'G_A'))?.status).toBe('activated');
    expect((await getGroup(admin, BOT, 'G_B'))?.status).toBe('pending');
  });

  it('markGroupLeft sets left, and is a no-op (no throw) when absent', async () => {
    const admin = fakeAdmin([
      { id: 'g1', bot_id: BOT, external_group_id: 'G_A', status: 'activated', activated_at: '2026-06-04T00:00:00Z' },
    ]);
    await markGroupLeft(admin, BOT, 'G_A');
    expect((await getGroup(admin, BOT, 'G_A'))?.status).toBe('left');
    await expect(markGroupLeft(admin, BOT, 'G_MISSING')).resolves.toBeUndefined();
  });
});
