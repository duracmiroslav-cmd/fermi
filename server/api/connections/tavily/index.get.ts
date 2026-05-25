import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const admin = useSupabaseAdmin();
  const { data: cred, error: credErr } = await admin
    .from('encrypted_credentials')
    .select('created_at')
    .eq('user_id', user.id)
    .eq('key_type', 'tavily')
    .is('bot_id', null)
    .maybeSingle();
  if (credErr) throw credErr;

  if (!cred) return { connected: false as const };
  return { connected: true as const, connectedAt: cred.created_at };
});
