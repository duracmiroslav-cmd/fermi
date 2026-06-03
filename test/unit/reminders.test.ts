import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cancelReminder,
  createReminder,
  listReminders,
} from '../../supabase/functions/agent/tools/reminders';

// In-memory model of the slices of Postgres these tools touch. The .eq
// filters are applied for real so cross-end-user isolation is tested
// behaviorally (User A genuinely cannot see/cancel User B's row), not by
// asserting "we called .eq". Mirrors counters.test's fake-backend style.

interface ReminderRow {
  id:               string;
  owner_id:         string;
  bot_id:           string;
  thread_id:        string;
  external_user_id: string;
  fire_at:          string;
  message:          string;
  status:           'pending' | 'fired' | 'cancelled' | 'failed';
}

const makeAdmin = (rows: ReminderRow[]): SupabaseClient => {
  let seq = 0;
  const matches = (row: ReminderRow, filters: Array<[string, unknown]>) =>
    filters.every(([col, val]) => (row as unknown as Record<string, unknown>)[col] === val);

  const admin = {
    from: () => ({
      insert: (values: Omit<ReminderRow, 'id' | 'status'>) => ({
        select: () => ({
          single: () => {
            const row: ReminderRow = { id: `r${++seq}`, status: 'pending', ...values };
            rows.push(row);
            return Promise.resolve({ data: { id: row.id, fire_at: row.fire_at }, error: null });
          },
        }),
      }),
      update: (patch: Partial<ReminderRow>) => {
        const filters: Array<[string, unknown]> = [];
        const builder = {
          eq: (col: string, val: unknown) => {
            filters.push([col, val]);
            return builder;
          },
          select:      () => builder,
          maybeSingle: () => {
            const row = rows.find(r => matches(r, filters));
            if (!row) return Promise.resolve({ data: null, error: null });
            Object.assign(row, patch);
            return Promise.resolve({ data: { id: row.id }, error: null });
          },
        };
        return builder;
      },
      select: () => {
        const filters: Array<[string, unknown]> = [];
        const builder = {
          eq: (col: string, val: unknown) => {
            filters.push([col, val]);
            return builder;
          },
          order: () => Promise.resolve({
            data:  rows.filter(r => matches(r, filters)),
            error: null,
          }),
        };
        return builder;
      },
    }),
  } as unknown as SupabaseClient;
  return admin;
};

const ctx = (admin: SupabaseClient, over: Partial<Record<string, string>> = {}) => ({
  admin,
  ownerId:        over.ownerId ?? 'ownerA',
  externalUserId: over.externalUserId ?? 'userA',
  botId:          over.botId ?? 'bot1',
  threadId:       over.threadId ?? 'thread1',
  // unused by these tools but part of ToolContext
  kek:            {} as CryptoKey,
  runId:          'run1',
  toolCallId:     'tc1',
  attachments:    [],
}) as unknown as Parameters<typeof createReminder.execute>[1];

const future = () => new Date(Date.now() + 3_600_000).toISOString();

describe('create_reminder', () => {
  let rows: ReminderRow[];
  beforeEach(() => {
    rows = [];
  });

  it('rejects a fire_at in the past without inserting', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const res = await createReminder.execute({ fire_at: past, message: 'x' }, ctx(makeAdmin(rows))) as { error?: string };
    expect(res.error).toMatch(/past/i);
    expect(rows).toHaveLength(0);
  });

  it('rejects an unparseable fire_at without inserting', async () => {
    const res = await createReminder.execute({ fire_at: 'next tuesday', message: 'x' }, ctx(makeAdmin(rows))) as { error?: string };
    expect(res.error).toMatch(/parse/i);
    expect(rows).toHaveLength(0);
  });

  it('requires both fire_at and message', async () => {
    const res = await createReminder.execute({ fire_at: future() }, ctx(makeAdmin(rows))) as { error?: string };
    expect(res.error).toBeTruthy();
    expect(rows).toHaveLength(0);
  });

  it('inserts and returns the created reminder on success', async () => {
    const res = await createReminder.execute({ fire_at: future(), message: 'call mom' }, ctx(makeAdmin(rows))) as { ok?: boolean; id?: string };
    expect(res.ok).toBe(true);
    expect(res.id).toBeTruthy();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ owner_id: 'ownerA', external_user_id: 'userA', message: 'call mom', status: 'pending' });
  });
});

describe('cancel_reminder cross-end-user isolation', () => {
  let rows: ReminderRow[];
  beforeEach(() => {
    rows = [{
      id:               'rB', owner_id:         'ownerA', bot_id:           'b', thread_id:        't',
      external_user_id: 'userB', fire_at:          future(), message:          'secret', status:           'pending',
    }];
  });

  it('User A cannot cancel User B\'s reminder on the same bot', async () => {
    const res = await cancelReminder.execute({ id: 'rB' }, ctx(makeAdmin(rows), { externalUserId: 'userA' })) as { error?: string };
    expect(res.error).toBeTruthy();
    // The victim's reminder is untouched.
    expect(rows[0].status).toBe('pending');
  });

  it('User B can cancel their own reminder', async () => {
    const res = await cancelReminder.execute({ id: 'rB' }, ctx(makeAdmin(rows), { externalUserId: 'userB' })) as { ok?: boolean };
    expect(res.ok).toBe(true);
    expect(rows[0].status).toBe('cancelled');
  });

  it('requires an id', async () => {
    const res = await cancelReminder.execute({}, ctx(makeAdmin(rows))) as { error?: string };
    expect(res.error).toBeTruthy();
  });
});

describe('list_reminders', () => {
  it('returns only this end-user\'s pending reminders', async () => {
    const rows: ReminderRow[] = [
      { id: 'a', owner_id: 'ownerA', bot_id: 'b', thread_id: 't', external_user_id: 'userA', fire_at: future(), message: 'mine', status: 'pending' },
      { id: 'b', owner_id: 'ownerA', bot_id: 'b', thread_id: 't', external_user_id: 'userB', fire_at: future(), message: 'theirs', status: 'pending' },
      { id: 'c', owner_id: 'ownerA', bot_id: 'b', thread_id: 't', external_user_id: 'userA', fire_at: future(), message: 'done', status: 'fired' },
    ];
    const res = await listReminders.execute({}, ctx(makeAdmin(rows), { externalUserId: 'userA' })) as { reminders: ReminderRow[] };
    expect(res.reminders.map(r => r.id)).toEqual(['a']);
  });
});
