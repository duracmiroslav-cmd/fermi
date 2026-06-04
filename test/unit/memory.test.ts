import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  forgetMemory,
  listMemories,
} from '../../supabase/functions/agent/tools/memory';

// In-memory model of the slice of Postgres these tools touch. The .eq filters
// run for real, so the (bot, subject) isolation boundary is tested
// behaviorally — subject A genuinely cannot list/forget subject B's rows, and
// one bot cannot reach another's even on a colliding subject_external_id.
// Mirrors reminders.test's fake-backend style; forget is a hard delete, so a
// successful forget removes the row outright (no status field).

interface MemoryRow {
  id:                  string;
  bot_id:              string;
  owner_id:            string;
  subject_type:        'user' | 'group';
  subject_external_id: string;
  content:             string;
  created_at:          string;
}

const makeAdmin = (rows: MemoryRow[]): SupabaseClient => {
  const matches = (row: MemoryRow, filters: Array<[string, unknown]>) =>
    filters.every(([col, val]) => (row as unknown as Record<string, unknown>)[col] === val);

  const admin = {
    from: () => ({
      delete: () => {
        const filters: Array<[string, unknown]> = [];
        const builder = {
          eq: (col: string, val: unknown) => {
            filters.push([col, val]);
            return builder;
          },
          select:      () => builder,
          maybeSingle: () => {
            const idx = rows.findIndex(r => matches(r, filters));
            if (idx === -1) return Promise.resolve({ data: null, error: null });
            const [removed] = rows.splice(idx, 1);
            return Promise.resolve({ data: { id: removed!.id }, error: null });
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
            data:  rows.filter(r => matches(r, filters)).map(r => ({ id: r.id, content: r.content })),
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
  ownerId:           over.ownerId ?? 'ownerA',
  botId:             over.botId ?? 'bot1',
  subjectType:       over.subjectType ?? 'user',
  subjectExternalId: over.subjectExternalId ?? 'userA',
  // part of ToolContext but unused by these tools
  externalUserId:    over.subjectExternalId ?? 'userA',
  agentId:           'agent1',
  threadId:          'thread1',
  kek:               {} as CryptoKey,
  runId:             'run1',
  toolCallId:        'tc1',
  attachments:       [],
}) as unknown as Parameters<typeof forgetMemory.execute>[1];

const seed = (over: Partial<MemoryRow> & Pick<MemoryRow, 'id'>): MemoryRow => ({
  bot_id:              'bot1',
  owner_id:            'ownerA',
  subject_type:        'user',
  subject_external_id: 'userA',
  content:             'a fact',
  created_at:          new Date().toISOString(),
  ...over,
});

describe('forget_memory (bot, subject) isolation', () => {
  let rows: MemoryRow[];
  beforeEach(() => {
    rows = [seed({ id: 'mB', subject_external_id: 'userB', content: 'secret' })];
  });

  it('subject A cannot forget subject B\'s memory on the same bot', async () => {
    const res = await forgetMemory.execute({ id: 'mB' }, ctx(makeAdmin(rows), { subjectExternalId: 'userA' })) as { error?: string };
    expect(res.error).toBeTruthy();
    expect(rows).toHaveLength(1); // victim's row untouched
  });

  it('subject B can forget their own memory (hard delete removes the row)', async () => {
    const res = await forgetMemory.execute({ id: 'mB' }, ctx(makeAdmin(rows), { subjectExternalId: 'userB' })) as { ok?: boolean };
    expect(res.ok).toBe(true);
    expect(rows).toHaveLength(0);
  });

  it('one bot cannot forget another bot\'s memory on a colliding subject id', async () => {
    rows = [seed({ id: 'mX', bot_id: 'bot2', subject_external_id: 'userA' })];
    const res = await forgetMemory.execute({ id: 'mX' }, ctx(makeAdmin(rows), { botId: 'bot1', subjectExternalId: 'userA' })) as { error?: string };
    expect(res.error).toBeTruthy();
    expect(rows).toHaveLength(1);
  });

  it('requires an id', async () => {
    const res = await forgetMemory.execute({}, ctx(makeAdmin(rows))) as { error?: string };
    expect(res.error).toBeTruthy();
  });

  it('rejects a non-string id without deleting', async () => {
    const res = await forgetMemory.execute({ id: 42 }, ctx(makeAdmin(rows))) as { error?: string };
    expect(res.error).toBeTruthy();
    expect(rows).toHaveLength(1);
  });

  it('a user subject cannot forget a group memory sharing the external id', async () => {
    rows = [seed({ id: 'mG', subject_type: 'group', subject_external_id: 'shared1' })];
    const res = await forgetMemory.execute({ id: 'mG' }, ctx(makeAdmin(rows), { subjectType: 'user', subjectExternalId: 'shared1' })) as { error?: string };
    expect(res.error).toBeTruthy();
    expect(rows).toHaveLength(1);
  });
});

describe('list_memories', () => {
  it('returns only this (bot, subject)\'s memories', async () => {
    const rows: MemoryRow[] = [
      seed({ id: 'a', subject_external_id: 'userA', content: 'mine' }),
      seed({ id: 'b', subject_external_id: 'userB', content: 'theirs' }),
      seed({ id: 'c', bot_id: 'bot2', subject_external_id: 'userA', content: 'other bot' }),
    ];
    const res = await listMemories.execute({}, ctx(makeAdmin(rows), { botId: 'bot1', subjectExternalId: 'userA' })) as { memories: Array<{ id: string }> };
    expect(res.memories.map(m => m.id)).toEqual(['a']);
  });
});
