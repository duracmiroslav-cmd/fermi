import { getCurrentUser } from '~~/server/utils/auth';
import { updateAgentInputSchema } from '~~/shared/schemas/agents';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const id = getUuidParam(event, 'id');

  const body = await readBody(event);
  const parsed = updateAgentInputSchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }
  const input = parsed.data;

  // Explicit camel→snake mapping picks the writable columns. Unknown
  // keys never reach this map because the schema is `.strict()`.
  const patch: Record<string, unknown> = {};
  if ('name' in input) patch.name = input.name;
  if ('systemPrompt' in input) patch.system_prompt = input.systemPrompt;
  if ('defaultModel' in input) patch.default_model = input.defaultModel;
  if ('avatarUrl' in input) patch.avatar_url = input.avatarUrl;

  if (Object.keys(patch).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' });
  }

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('agents')
    .update(patch)
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .select('id, name, system_prompt, default_model, avatar_url, updated_at')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Agent not found' });
  }

  return {
    id: data.id,
    name: data.name,
    systemPrompt: data.system_prompt,
    defaultModel: data.default_model,
    avatarUrl: data.avatar_url,
    updatedAt: data.updated_at,
  };
});
