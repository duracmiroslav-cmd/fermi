import type { SupabaseClient } from '@supabase/supabase-js';

// Both lookups filter `deleted_at is null` AND `disabled_at is null`,
// so callers can treat a non-null return as "active, replyable bot."
// Downstream credential loaders and the agent worker trust this
// invariant instead of re-checking. A disabled bot still accepts
// webhook events at the HTTP layer (no 4xx, so LINE stops retrying)
// but the worker no-ops on it, pause means "stop replying," not
// "drop the connection."

export interface BotRef {
  id:      string;
  ownerId: string;
  agentId: string | null;
}

export const findBotByExternalId = async (
  admin: SupabaseClient,
  platform: string,
  externalId: string,
): Promise<BotRef | null> => {
  const { data, error } = await admin
    .from('bots')
    .select('id, owner_id, agent_id')
    .eq('platform', platform)
    .eq('external_id', externalId)
    .is('deleted_at', null)
    .is('disabled_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, ownerId: data.owner_id, agentId: data.agent_id } : null;
};

export const findBotById = async (
  admin: SupabaseClient,
  botId: string,
): Promise<BotRef | null> => {
  const { data, error } = await admin
    .from('bots')
    .select('id, owner_id, agent_id')
    .eq('id', botId)
    .is('deleted_at', null)
    .is('disabled_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, ownerId: data.owner_id, agentId: data.agent_id } : null;
};
