import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);
  const id = getUuidParam(event, 'id');

  const admin = useSupabaseAdmin();
  const { error } = await admin.rpc('delete_byo_capability', {
    p_owner_id:      user.id,
    p_capability_id: id,
  });
  if (error) {
    if (error.code === 'P0002') {
      throw createError({ statusCode: 404, statusMessage: 'MCP server not found' });
    }
    throw error;
  }

  return { ok: true as const };
});
