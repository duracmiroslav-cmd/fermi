import { z } from 'zod';

// LINE's own credential names (Channel Secret / Channel Access Token)
// are kept on the input shape — they describe LINE's API, not fermi's
// `bots` domain.
const lineBotInputSchema = z.object({
  platform: z.literal('line'),
  channelSecret: z.string().min(1, 'channelSecret is required'),
  channelAccessToken: z.string().min(1, 'channelAccessToken is required'),
});

export const connectBotInputSchema = z.discriminatedUnion('platform', [
  lineBotInputSchema,
]);

export const updateBotInputSchema = z.object({
  agentId: z.string().uuid().nullable().optional(),
  displayName: z.string().min(1).max(120).nullable().optional(),
  // `null` re-enables the bot; an ISO-8601 timestamp marks it disabled.
  // The form sends `new Date().toISOString()` on disable.
  disabledAt: z.string().datetime().nullable().optional(),
  allowGroups: z.boolean().optional(),
}).strict();

export type ConnectBotInput = z.infer<typeof connectBotInputSchema>;
export type LineBotInput = z.infer<typeof lineBotInputSchema>;
export type UpdateBotInput = z.infer<typeof updateBotInputSchema>;
