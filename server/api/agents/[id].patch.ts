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
  if ('defaultTextModel' in input) patch.default_text_model = input.defaultTextModel;
  if ('defaultVisionModel' in input) patch.default_vision_model = input.defaultVisionModel;
  if ('modelProviderId' in input) patch.model_provider_id = input.modelProviderId;
  if ('voiceReplyMode' in input) patch.voice_reply_mode = input.voiceReplyMode;
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
    .select('id, name, system_prompt, default_text_model, default_vision_model, model_provider_id, voice_reply_mode, avatar_url, updated_at')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Agent not found' });
  }

  return {
    id:                 data.id,
    name:               data.name,
    systemPrompt:       data.system_prompt,
    defaultTextModel:   data.default_text_model,
    defaultVisionModel: data.default_vision_model,
    modelProviderId:    data.model_provider_id,
    voiceReplyMode:     data.voice_reply_mode,
    avatarUrl:          data.avatar_url,
    updatedAt:          data.updated_at,
  };
});
