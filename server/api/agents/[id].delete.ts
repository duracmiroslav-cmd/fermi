import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing agent id' });
  }

  const admin = useSupabaseAdmin();
  const { data, error } = await admin.rpc('delete_agent', {
    p_agent_id: id,
    p_owner_id: user.id,
  });
  if (error) {
    if (error.message?.includes('agent_not_found')) {
      throw createError({ statusCode: 404, statusMessage: 'Agent not found' });
    }
    throw error;
  }

  return { id: data };
});
