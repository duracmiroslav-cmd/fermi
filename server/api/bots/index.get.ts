import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('bots')
    .select('id, platform, external_id, display_name, agent_id, enabled, allow_groups, created_at')
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const url = getRequestURL(event);
  return data.map(row => ({
    id: row.id,
    platform: row.platform,
    externalId: row.external_id,
    displayName: row.display_name,
    agentId: row.agent_id,
    enabled: row.enabled,
    allowGroups: row.allow_groups,
    createdAt: row.created_at,
    webhookUrl: `${url.origin}/api/webhook/${row.platform}`,
  }));
});
