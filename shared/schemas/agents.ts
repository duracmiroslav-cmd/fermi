import { z } from 'zod';

export const createAgentInputSchema = z.object({
  name: z.string().min(1).max(80),
  systemPrompt: z.string().max(8000).nullish(),
  defaultTextModel: z.string().max(120).nullish(),
  defaultVisionModel: z.string().max(120).nullish(),
  // Optional on input: omitting it lets the server default to the
  // OpenRouter row in `model_providers`, preserving today's API shape
  // for callers that pre-date BYOK. The DB column is NOT NULL, so
  // null is rejected; use .optional() (undefined-only), not .nullish().
  modelProviderId: z.string().uuid().optional(),
  avatarUrl: z.string().url().max(2048).nullish(),
}).strict();

export const updateAgentInputSchema = createAgentInputSchema.partial();

export type CreateAgentInput = z.infer<typeof createAgentInputSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentInputSchema>;
