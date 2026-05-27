import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('bots')
    .select('id, platform, external_id, display_name, avatar_url, agent_id, disabled_at, webhook_verified_at, created_at')
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
    avatarUrl: row.avatar_url,
    agentId: row.agent_id,
    disabledAt: row.disabled_at,
    webhookVerifiedAt: row.webhook_verified_at,
    createdAt: row.created_at,
    webhookUrl: `${url.origin}/api/webhook/${row.platform}`,
  }));
});
