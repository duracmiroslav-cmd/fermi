import type { SupabaseClient } from '@supabase/supabase-js';

export type GroupStatus = 'pending' | 'activated' | 'left';

export interface GroupRow {
  id:     string;
  status: GroupStatus;
}

export const getGroup = async (
  admin: SupabaseClient,
  botId: string,
  externalGroupId: string,
): Promise<GroupRow | null> => {
  const { data, error } = await admin
    .from('groups')
    .select('id, status')
    .eq('bot_id', botId)
    .eq('external_group_id', externalGroupId)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, status: data.status as GroupStatus } : null;
};

// Lazily creates a pending row on first contact, so activation survives
// a missed `join` event (LINE delivers it once) — the first group
// message still establishes the row. No-op if the group already exists.
export const ensureGroup = async (
  admin: SupabaseClient,
  botId: string,
  externalGroupId: string,
): Promise<GroupRow> => {
  const existing = await getGroup(admin, botId, externalGroupId);
  if (existing) return existing;

  const { data, error: insertErr } = await admin
    .from('groups')
    .insert({ bot_id: botId, external_group_id: externalGroupId })
    .select('id, status')
    .single();
  if (insertErr) {
    // 23505 = unique_violation: two messages raced to create the row.
    // The other write won; re-read it.
    if (insertErr.code === '23505') {
      const raced = await getGroup(admin, botId, externalGroupId);
      if (raced) return raced;
    }
    throw insertErr;
  }
  return { id: data.id, status: data.status as GroupStatus };
};

// CAS pending → activated. Returns true only on the transition so the
// caller posts the welcome exactly once; concurrent correct-code entries
// and already-activated groups return false.
export const activateGroup = async (
  admin: SupabaseClient,
  botId: string,
  externalGroupId: string,
): Promise<boolean> => {
  const { data, error: updateErr } = await admin
    .from('groups')
    .update({ status: 'activated', activated_at: new Date().toISOString() })
    .eq('bot_id', botId)
    .eq('external_group_id', externalGroupId)
    .eq('status', 'pending')
    .select('id');
  if (updateErr) throw updateErr;
  return (data?.length ?? 0) > 0;
};

export const markGroupLeft = async (
  admin: SupabaseClient,
  botId: string,
  externalGroupId: string,
): Promise<void> => {
  const { error: markErr } = await admin
    .from('groups')
    .update({ status: 'left' })
    .eq('bot_id', botId)
    .eq('external_group_id', externalGroupId);
  if (markErr) throw markErr;
};
