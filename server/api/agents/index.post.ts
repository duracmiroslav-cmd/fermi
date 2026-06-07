import { getCurrentUser } from '~~/server/utils/auth';
import { createAgentInputSchema } from '~~/shared/schemas/agents';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const body = await readBody(event);
  const parsed = createAgentInputSchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }
  const input = parsed.data;

  const admin = useSupabaseAdmin();

  // Resolve modelProviderId. Callers can omit it (pre-BYOK API shape)
  // and we land on OpenRouter to match the previous default. The
  // catalog lookup runs only on the unset path so the common case
  // (caller already knows the provider id) stays a single round-trip.
  let modelProviderId = input.modelProviderId;
  if (!modelProviderId) {
    const { data: provider, error: providerErr } = await admin
      .from('model_providers')
      .select('id')
      .eq('slug', 'openrouter')
      .single();
    if (providerErr) throw providerErr;
    modelProviderId = provider.id;
  }

  const { data: agent, error: insertErr } = await admin
    .from('agents')
    .insert({
      owner_id:              user.id,
      name:                  input.name,
      system_prompt:         input.systemPrompt ?? null,
      default_text_model:    input.defaultTextModel ?? null,
      default_vision_model:  input.defaultVisionModel ?? null,
      default_tts_model:     input.defaultTtsModel ?? null,
      default_tts_voice:     input.defaultTtsVoice ?? null,
      tts_instructions:      input.ttsInstructions ?? null,
      model_provider_id:     modelProviderId,
      voice_reply_mode:      input.voiceReplyMode ?? 'off',
      normalize_traditional: input.normalizeTraditional ?? true,
      avatar_url:            input.avatarUrl ?? null,
    })
    .select('id')
    .single();
  if (insertErr) throw insertErr;

  return {
    id:                   agent.id,
    name:                 input.name,
    systemPrompt:         input.systemPrompt ?? null,
    defaultTextModel:     input.defaultTextModel ?? null,
    defaultVisionModel:   input.defaultVisionModel ?? null,
    defaultTtsModel:      input.defaultTtsModel ?? null,
    defaultTtsVoice:      input.defaultTtsVoice ?? null,
    ttsInstructions:      input.ttsInstructions ?? null,
    modelProviderId,
    voiceReplyMode:       input.voiceReplyMode ?? 'off',
    normalizeTraditional: input.normalizeTraditional ?? true,
    avatarUrl:            input.avatarUrl ?? null,
  };
});
