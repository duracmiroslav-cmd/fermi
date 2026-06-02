import type { Database } from '~~/app/types/database.types';
import { getCurrentUser } from '~~/server/utils/auth';
import { AGENT_LIMIT, type Tier } from '~~/shared/constants/tiers';
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

  const { data: userRow, error: userErr } = await admin
    .from('users').select('tier').eq('id', user.id).single();
  if (userErr) throw userErr;
  const limit = AGENT_LIMIT[userRow.tier as Tier];

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

  // The generated Args type marks every text param non-null, but these columns
  // and their SQL params accept NULL — cast past the generator's blind spot.
  const { data: rows, error: insertErr } = await admin.rpc('insert_agent_if_under_limit', {
    p_owner_id:              user.id,
    p_name:                  input.name,
    p_system_prompt:         input.systemPrompt ?? null,
    p_default_text_model:    input.defaultTextModel ?? null,
    p_default_vision_model:  input.defaultVisionModel ?? null,
    p_default_tts_model:     input.defaultTtsModel ?? null,
    p_default_tts_voice:     input.defaultTtsVoice ?? null,
    p_tts_instructions:      input.ttsInstructions ?? null,
    p_model_provider_id:     modelProviderId,
    p_voice_reply_mode:      input.voiceReplyMode ?? 'off',
    p_normalize_traditional: input.normalizeTraditional ?? true,
    p_avatar_url:            input.avatarUrl ?? null,
    p_limit:                 limit,
  } as Database['public']['Functions']['insert_agent_if_under_limit']['Args']);
  if (insertErr) {
    if (insertErr.message?.includes('agent_limit_reached')) {
      throw createError({
        statusCode:    403,
        statusMessage: `Agent limit reached (max ${limit})`,
      });
    }
    throw insertErr;
  }
  const agent = rows?.[0];
  if (!agent) {
    throw new Error('insert_agent_if_under_limit returned no row');
  }

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
