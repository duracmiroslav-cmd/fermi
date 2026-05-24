import { z } from 'zod';

export const createAgentInputSchema = z.object({
  name: z.string().min(1).max(80),
  systemPrompt: z.string().max(8000).nullish(),
  defaultModel: z.string().max(120).nullish(),
  avatarUrl: z.string().url().max(2048).nullish(),
}).strict();

export const updateAgentInputSchema = createAgentInputSchema.partial();

export type CreateAgentInput = z.infer<typeof createAgentInputSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentInputSchema>;
