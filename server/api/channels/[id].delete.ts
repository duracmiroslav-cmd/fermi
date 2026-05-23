import { serverSupabaseUser } from '#supabase/server';

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing channel id' });
  }

  const admin = useSupabaseAdmin();
  const { data, error } = await admin.rpc('delete_channel', {
    p_channel_id: id,
    p_owner_id: user.id,
  });
  if (error) {
    if (error.message?.includes('channel_not_found')) {
      throw createError({ statusCode: 404, statusMessage: 'Channel not found' });
    }
    throw error;
  }

  return { id: data };
});
