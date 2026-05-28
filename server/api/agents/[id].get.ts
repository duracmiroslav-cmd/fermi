import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const id = getUuidParam(event, 'id');

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('agents')
    .select('id, name, system_prompt, default_text_model, default_vision_model, model_provider_id, voice_reply_mode, avatar_url, is_default, created_at, updated_at')
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Agent not found' });
  }

  const { data: bots, error: botErr } = await admin
    .from('bots')
    .select('id, display_name, platform, avatar_url, disabled_at, webhook_verified_at')
    .eq('agent_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (botErr) throw botErr;

  // Most-recent successful reply per bot, derived from agent_runs.
  // Mirrors the bot list endpoint; not a column on bots.
  const { data: lastReplied, error: lastRepliedErr } = await admin
    .rpc('get_bots_last_replied', { p_owner_id: user.id });
  if (lastRepliedErr) throw lastRepliedErr;
  const lastRepliedByBot = new Map<string, string>(
    (lastReplied ?? []).map(r => [r.bot_id, r.last_replied_at]),
  );

  return {
    id:                 data.id,
    name:               data.name,
    systemPrompt:       data.system_prompt,
    defaultTextModel:   data.default_text_model,
    defaultVisionModel: data.default_vision_model,
    modelProviderId:    data.model_provider_id,
    voiceReplyMode:     data.voice_reply_mode,
    avatarUrl:          data.avatar_url,
    isDefault:          data.is_default,
    createdAt:          data.created_at,
    updatedAt:          data.updated_at,
    bots:               (bots ?? []).map(b => ({
      id:                b.id,
      displayName:       b.display_name,
      platform:          b.platform,
      avatarUrl:         b.avatar_url,
      disabledAt:        b.disabled_at,
      webhookVerifiedAt: b.webhook_verified_at,
      lastRepliedAt:     lastRepliedByBot.get(b.id) ?? null,
    })),
  };
});
