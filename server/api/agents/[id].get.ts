import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing agent id' });
  }

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('agents')
    .select('id, name, system_prompt, default_model, avatar_url, created_at, updated_at')
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Agent not found' });
  }

  const { data: bot, error: botErr } = await admin
    .from('bots')
    .select('id, display_name, platform')
    .eq('agent_id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (botErr) throw botErr;

  return {
    id: data.id,
    name: data.name,
    systemPrompt: data.system_prompt,
    defaultModel: data.default_model,
    avatarUrl: data.avatar_url,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    bot: bot
      ? { id: bot.id, displayName: bot.display_name, platform: bot.platform }
      : null,
  };
});
