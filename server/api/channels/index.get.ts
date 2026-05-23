import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('channels')
    .select('id, channel_type, external_id, display_name, created_at')
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const url = getRequestURL(event);
  return data.map(row => ({
    id: row.id,
    type: row.channel_type,
    externalId: row.external_id,
    displayName: row.display_name,
    createdAt: row.created_at,
    webhookUrl: `${url.origin}/api/webhook/${row.channel_type}`,
  }));
});
