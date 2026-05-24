import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('users')
    .select('id, email, display_name, avatar_url, locale, timezone, tier')
    .eq('id', user.id)
    .single();
  if (error) throw error;

  return {
    id: data.id,
    email: data.email,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    locale: data.locale,
    timezone: data.timezone,
    tier: data.tier,
  };
});
