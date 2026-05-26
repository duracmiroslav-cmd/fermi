import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const id = getUuidParam(event, 'id');

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('agents')
    .select('id, name, system_prompt, default_text_model, model_provider_id, avatar_url, is_default, created_at, updated_at')
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Agent not found' });
  }

  const { data: bots, error: botErr } = await admin
    .from('bots')
    .select('id, display_name, platform')
    .eq('agent_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (botErr) throw botErr;

  return {
    id: data.id,
    name: data.name,
    systemPrompt: data.system_prompt,
    defaultTextModel: data.default_text_model,
    modelProviderId: data.model_provider_id,
    avatarUrl: data.avatar_url,
    isDefault: data.is_default,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    bots: (bots ?? []).map(b => ({
      id: b.id,
      displayName: b.display_name,
      platform: b.platform,
    })),
  };
});
