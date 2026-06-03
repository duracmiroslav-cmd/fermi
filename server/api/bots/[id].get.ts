import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const id = getUuidParam(event, 'id');

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('bots')
    .select('id, platform, external_id, handle, display_name, avatar_url, agent_id, group_activation_code, group_transcribe_enabled, group_mention_enabled, disabled_at, webhook_verified_at, created_at, updated_at')
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw createError({
      statusCode:    404,
      statusMessage: 'Bot not found',
      data:          { code: '__errorBotNotFound' },
    });
  }

  // First successful reply, derived from agent_runs (the single source
  // of truth, not a column). The owner-scoped RPC mirrors the bot list's
  // `get_bots_last_replied`; this picks out the one bot's row.
  const { data: firstReplied, error: firstRepliedErr } = await admin
    .rpc('get_bots_first_replied', { p_owner_id: user.id });
  if (firstRepliedErr) throw firstRepliedErr;
  const firstRepliedAt = firstReplied?.find(r => r.bot_id === id)?.first_replied_at ?? null;

  let agent: {
    id:               string;
    name:             string;
    avatarUrl:        string | null;
    defaultTextModel: string | null;
    isDefault:        boolean;
    updatedAt:        string;
  } | null = null;
  if (data.agent_id) {
    const { data: agentRow, error: agentErr } = await admin
      .from('agents')
      .select('id, name, avatar_url, default_text_model, is_default, updated_at')
      .eq('id', data.agent_id)
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (agentErr) throw agentErr;
    if (agentRow) {
      agent = {
        id:               agentRow.id,
        name:             agentRow.name,
        avatarUrl:        agentRow.avatar_url,
        defaultTextModel: agentRow.default_text_model,
        isDefault:        agentRow.is_default,
        updatedAt:        agentRow.updated_at,
      };
    }
  }

  const { appUrl } = useRuntimeConfig(event);
  const origin = appUrl || getRequestURL(event).origin;

  return {
    id:                     data.id,
    platform:               data.platform,
    externalId:             data.external_id,
    handle:                 data.handle,
    displayName:            data.display_name,
    avatarUrl:              data.avatar_url,
    agentId:                data.agent_id,
    groupActivationCode:    data.group_activation_code,
    groupTranscribeEnabled: data.group_transcribe_enabled,
    groupMentionEnabled:    data.group_mention_enabled,
    disabledAt:             data.disabled_at,
    webhookVerifiedAt:      data.webhook_verified_at,
    firstRepliedAt,
    createdAt:              data.created_at,
    updatedAt:              data.updated_at,
    webhookUrl:             `${origin}/api/webhook/${data.platform}`,
    agent,
  };
});
