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
  // Whether the bot replies to @mentions in activated groups.
  groupMentionEnabled:    boolean;
}

const BOT_SELECT = 'id, owner_id, agent_id, group_activation_code, group_transcribe_enabled, group_mention_enabled';

const toBotRef = (data: {
  id:                       string;
  owner_id:                 string;
  agent_id:                 string | null;
  group_activation_code:    string | null;
  group_transcribe_enabled: boolean;
  group_mention_enabled:    boolean;
}): BotRef => ({
  id:                     data.id,
  ownerId:                data.owner_id,
  agentId:                data.agent_id,
  groupActivationCode:    data.group_activation_code,
  groupTranscribeEnabled: data.group_transcribe_enabled,
  groupMentionEnabled:    data.group_mention_enabled,
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
