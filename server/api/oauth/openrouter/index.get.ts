import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('encrypted_credentials')
    .select('metadata, created_at')
    .eq('user_id', user.id)
    .eq('key_type', 'openrouter')
    .is('channel_id', null)
    .maybeSingle();
  if (error) throw error;

  if (!data) return { connected: false as const };

  const meta = (data.metadata ?? {}) as { openrouter_user_id?: string };
  return {
    connected: true as const,
    openrouterUserId: meta.openrouter_user_id ?? null,
    connectedAt: data.created_at,
  };
});
