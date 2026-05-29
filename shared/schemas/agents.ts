import { z } from 'zod';
import { VOICE_REPLY_MODES } from '../agents';
import { TTS_MODELS, TTS_VOICES } from '../tts';

export const createAgentInputSchema = z.object({
  name:               z.string().min(1).max(80),
  systemPrompt:       z.string().max(8000).nullish(),
  defaultTextModel:   z.string().max(120).nullish(),
  defaultVisionModel: z.string().max(120).nullish(),
  // TTS model / voice are narrow enums backed by `shared/tts.ts`.
  // The catalog grows with OpenAI, so validation lives here (write
  // side) rather than as a DB CHECK that requires a migration per
  // addition. ttsInstructions is free text; only honored by
  // gpt-4o-mini-tts (older models silently ignore it).
  defaultTtsModel:    z.enum(TTS_MODELS).nullish(),
  defaultTtsVoice:    z.enum(TTS_VOICES).nullish(),
  ttsInstructions:    z.string().max(2000).nullish(),
  // Optional on input: omitting it lets the server default to the
  // OpenRouter row in `model_providers`, preserving today's API shape
  // for callers that pre-date BYOK. The DB column is NOT NULL, so
  // null is rejected; use .optional() (undefined-only), not .nullish().
  modelProviderId:    z.string().uuid().optional(),
  // Optional on input: POST applies `'off'` default at the handler
  // (matches DB default), so PATCH can omit voiceReplyMode to leave
  // the stored value unchanged — putting `.default()` here would make
  // PATCH silently reset it on every save.
  voiceReplyMode:     z.enum(VOICE_REPLY_MODES).optional(),
  avatarUrl:          z.string().url().max(2048).nullish(),
}).strict();

export const updateAgentInputSchema = createAgentInputSchema.partial();

export type CreateAgentInput = z.infer<typeof createAgentInputSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentInputSchema>;
