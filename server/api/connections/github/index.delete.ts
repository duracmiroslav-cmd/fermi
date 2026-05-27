import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const admin = useSupabaseAdmin();
  const { error: removeErr } = await admin
    .from('encrypted_credentials')
    .delete()
    .eq('user_id', user.id)
    .eq('key_type', 'github')
    .is('bot_id', null);
  if (removeErr) throw removeErr;

  return { ok: true as const };
});
