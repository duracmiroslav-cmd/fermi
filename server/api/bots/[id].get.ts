import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const id = getUuidParam(event, 'id');

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('bots')
    .select('id, platform, external_id, handle, display_name, avatar_url, agent_id, disabled_at, webhook_verified_at, first_replied_at, created_at, updated_at')
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Bot not found' });
  }

  let agent: {
    id: string;
    name: string;
    avatarUrl: string | null;
    defaultTextModel: string | null;
    isDefault: boolean;
    updatedAt: string;
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
        id: agentRow.id,
        name: agentRow.name,
        avatarUrl: agentRow.avatar_url,
        defaultTextModel: agentRow.default_text_model,
        isDefault: agentRow.is_default,
        updatedAt: agentRow.updated_at,
      };
    }
  }

  const { appUrl } = useRuntimeConfig(event);
  const origin = appUrl || getRequestURL(event).origin;

  return {
    id: data.id,
    platform: data.platform,
    externalId: data.external_id,
    handle: data.handle,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    agentId: data.agent_id,
    disabledAt: data.disabled_at,
    webhookVerifiedAt: data.webhook_verified_at,
    firstRepliedAt: data.first_replied_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    webhookUrl: `${origin}/api/webhook/${data.platform}`,
    agent,
  };
});
