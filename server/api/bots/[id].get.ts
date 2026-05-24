import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing bot id' });
  }

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('bots')
    .select('id, platform, external_id, display_name, agent_id, disabled_at, allow_groups, created_at, updated_at')
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Bot not found' });
  }

  let agent: { id: string; name: string } | null = null;
  if (data.agent_id) {
    const { data: agentRow, error: agentErr } = await admin
      .from('agents')
      .select('id, name')
      .eq('id', data.agent_id)
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (agentErr) throw agentErr;
    if (agentRow) agent = { id: agentRow.id, name: agentRow.name };
  }

  const url = getRequestURL(event);

  return {
    id: data.id,
    platform: data.platform,
    externalId: data.external_id,
    displayName: data.display_name,
    agentId: data.agent_id,
    disabledAt: data.disabled_at,
    allowGroups: data.allow_groups,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    webhookUrl: `${url.origin}/api/webhook/${data.platform}`,
    agent,
  };
});
