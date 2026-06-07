// Lightweight account snapshot injected into the system prompt so the assistant
// has a map of the owner's resources up front (it still calls get_agent /
// get_bot for full detail before editing). Loaded once per request.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AccountState {
  agents:    Array<{ id: string; name: string }>;
  bots:      Array<{ id: string; name: string; status: string; webhookVerified: boolean; hasReplied: boolean }>;
  connected: Set<string>;
}

// first_replied_at is NOT a bots column — it's derived from agent_runs via
// this RPC (single source of truth). Returns the set of the owner's bots
// that have produced a first successful reply.
export const repliedBotIds = async (
  admin: SupabaseClient,
  ownerId: string,
): Promise<Set<string>> => {
  const { data, error } = await admin.rpc('get_bots_first_replied', { p_owner_id: ownerId });
  if (error) throw error;
  return new Set(
    (data ?? [])
      .filter((r: { first_replied_at: string | null }) => r.first_replied_at !== null)
      .map((r: { bot_id: string }) => r.bot_id),
  );
};

export const loadAccountState = async (
  admin: SupabaseClient,
  ownerId: string,
): Promise<AccountState> => {
  const { data: agents, error: agentErr } = await admin
    .from('agents')
    .select('id, name')
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (agentErr) throw agentErr;

  const { data: bots, error: botErr } = await admin
    .from('bots')
    .select('id, display_name, disabled_at, webhook_verified_at')
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (botErr) throw botErr;

  const replied = await repliedBotIds(admin, ownerId);

  // Account-level connectors (bot_id null excludes per-bot LINE creds).
  const { data: creds, error: credErr } = await admin
    .from('encrypted_credentials')
    .select('key_type')
    .eq('user_id', ownerId)
    .is('bot_id', null);
  if (credErr) throw credErr;

  return {
    agents: (agents ?? []).map(a => ({ id: a.id, name: a.name })),
    bots:   (bots ?? []).map(b => ({
      id:              b.id,
      name:            b.display_name ?? '(unnamed)',
      status:          b.disabled_at ? 'paused' : 'active',
      webhookVerified: b.webhook_verified_at !== null,
      hasReplied:      replied.has(b.id),
    })),
    connected: new Set((creds ?? []).map(c => c.key_type as string)),
  };
};
