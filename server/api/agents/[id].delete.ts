import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing agent id' });
  }

  // Hard delete: bound bots' agent_id flips to NULL via FK
  // `on delete set null`, leaving the deployment intact for rebinding.
  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('agents')
    .delete()
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Agent not found' });
  }

  return { id: data.id };
});
