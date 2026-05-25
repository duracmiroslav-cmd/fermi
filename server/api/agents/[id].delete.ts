import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const id = getUuidParam(event, 'id');

  const admin = useSupabaseAdmin();
  const { data, error } = await admin.rpc('delete_agent', {
    p_agent_id: id,
    p_owner_id: user.id,
  });
  if (error) {
    if (error.message?.includes('agent_not_found')) {
      throw createError({ statusCode: 404, statusMessage: 'Agent not found' });
    }
    if (error.message?.includes('cannot_delete_default_agent')) {
      throw createError({ statusCode: 409, statusMessage: 'The default agent cannot be deleted' });
    }
    if (error.message?.includes('agent_in_use')) {
      throw createError({ statusCode: 409, statusMessage: 'Agent is bound to one or more bots — rebind them first' });
    }
    throw error;
  }

  return { id: data };
});
