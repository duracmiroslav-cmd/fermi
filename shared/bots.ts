import type { SupabaseClient } from '@supabase/supabase-js';

// Both lookups filter `deleted_at is null` AND `disabled_at is null`,
// so a non-null return is an "active, replyable bot." A disabled bot
// still accepts webhook events at the HTTP layer (no 4xx, so LINE
// stops retrying) but the worker no-ops on it: pause means "stop
// replying," not "drop the connection."

export interface BotRef {
  id:                     string;
  ownerId:                string;
  agentId:                string | null;
  // null = owner hasn't opted this bot into group chats.
  groupActivationCode:    string | null;
  // Whether voice in activated groups is transcribed (relay feature).
  groupTranscribeEnabled: boolean;
  // The LINE userId imprinted as master — gets in-LINE management when the
  // agent is in maintenance/debug mode. null until the imprint flow binds it.
  masterExternalId:       string | null;
  // One-time binding code + TTL the owner armed from the dashboard. A 1:1 text
  // matching a live code imprints the sender as master, then clears the code.
  imprintCode:            string | null;
  imprintCodeExpiresAt:   string | null;
}

const BOT_SELECT = 'id, owner_id, agent_id, group_activation_code, group_transcribe_enabled, master_external_id, imprint_code, imprint_code_expires_at';

const toBotRef = (data: {
  id:                       string;
  owner_id:                 string;
  agent_id:                 string | null;
  group_activation_code:    string | null;
  group_transcribe_enabled: boolean;
  master_external_id:       string | null;
  imprint_code:             string | null;
  imprint_code_expires_at:  string | null;
}): BotRef => ({
  id:                     data.id,
  ownerId:                data.owner_id,
  agentId:                data.agent_id,
  groupActivationCode:    data.group_activation_code,
  groupTranscribeEnabled: data.group_transcribe_enabled,
  masterExternalId:       data.master_external_id,
  imprintCode:            data.imprint_code,
  imprintCodeExpiresAt:   data.imprint_code_expires_at,
});

export const findBotByExternalId = async (
  admin: SupabaseClient,
  platform: string,
  externalId: string,
): Promise<BotRef | null> => {
  const { data, error } = await admin
    .from('bots')
    .select(BOT_SELECT)
    .eq('platform', platform)
    .eq('external_id', externalId)
    .is('deleted_at', null)
    .is('disabled_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? toBotRef(data) : null;
};

export const findBotById = async (
  admin: SupabaseClient,
  botId: string,
): Promise<BotRef | null> => {
  const { data, error } = await admin
    .from('bots')
    .select(BOT_SELECT)
    .eq('id', botId)
    .is('deleted_at', null)
    .is('disabled_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? toBotRef(data) : null;
};
