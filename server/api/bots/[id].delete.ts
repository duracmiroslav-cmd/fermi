import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const id = getUuidParam(event, 'id');

  const admin = useSupabaseAdmin();
  const { data, error } = await admin.rpc('delete_bot', {
    p_bot_id:   id,
    p_owner_id: user.id,
  });
  if (error) {
    if (error.message?.includes('bot_not_found')) {
      throw createError({ statusCode: 404, statusMessage: 'Bot not found' });
    }
    throw error;
  }

  return { id: data };
});
