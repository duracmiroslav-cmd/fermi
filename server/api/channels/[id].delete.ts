import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing channel id' });
  }

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('channels')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .select('id')
    .single();
  if (error) {
    if (error.code === 'PGRST116') {
      throw createError({ statusCode: 404, statusMessage: 'Channel not found' });
    }
    throw error;
  }

  // Hard-delete credentials so the (user_id, key_type, channel_id)
  // unique key is freed and a future reconnect of the same OA can
  // store fresh secrets without colliding on the dead channel row.
  const { error: credErr } = await admin
    .from('encrypted_credentials')
    .delete()
    .eq('channel_id', id);
  if (credErr) throw credErr;

  return { id: data.id };
});
