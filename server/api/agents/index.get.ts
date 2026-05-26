import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('agents')
    .select('id, name, system_prompt, default_text_model, model_provider_id, avatar_url, is_default, created_at, updated_at')
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;

  return data.map(row => ({
    id: row.id,
    name: row.name,
    systemPrompt: row.system_prompt,
    defaultTextModel: row.default_text_model,
    modelProviderId: row.model_provider_id,
    avatarUrl: row.avatar_url,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
});
