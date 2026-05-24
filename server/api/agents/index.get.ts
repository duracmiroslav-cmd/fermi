import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('agents')
    .select('id, name, system_prompt, default_model, avatar_url, created_at, updated_at')
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return data.map(row => ({
    id: row.id,
    name: row.name,
    systemPrompt: row.system_prompt,
    defaultModel: row.default_model,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
});
