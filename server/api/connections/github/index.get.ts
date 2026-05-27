import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const admin = useSupabaseAdmin();
  const { data: cred, error: credErr } = await admin
    .from('encrypted_credentials')
    .select('created_at, metadata')
    .eq('user_id', user.id)
    .eq('key_type', 'github')
    .is('bot_id', null)
    .maybeSingle();
  if (credErr) throw credErr;

  if (!cred) return { connected: false as const };

  const meta = (cred.metadata ?? {}) as { masked_key?: string; github_login?: string };
  return {
    connected:   true as const,
    maskedKey:   meta.masked_key ?? null,
    login:       meta.github_login ?? null,
    connectedAt: cred.created_at,
  };
});
