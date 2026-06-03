import { z } from 'zod';

// LINE's own credential names (Channel Secret / Channel Access Token)
// are kept on the input shape, they describe LINE's API, not fermi's
// `bots` domain.
const lineBotInputSchema = z.object({
  platform:           z.literal('line'),
  channelSecret:      z.string().min(1, 'channelSecret is required'),
  channelAccessToken: z.string().min(1, 'channelAccessToken is required'),
});

export const connectBotInputSchema = z.discriminatedUnion('platform', [
  lineBotInputSchema,
]);

export const updateBotInputSchema = z.object({
  // Required: every bot must point at an agent. Default agents (seeded
  // by the signup trigger, undeletable) guarantee there's always at
  // least one valid choice. Pause is handled solely by `disabledAt`.
  agentId:             z.string().uuid().optional(),
  // `null` re-enables the bot; an ISO-8601 timestamp marks it disabled.
  // The form sends `new Date().toISOString()` on disable.
  disabledAt:          z.string().datetime().nullable().optional(),
  // Group-chat activation gate (owner-set; an end-user types it in a
  // group to enable the bot there). 4–32 chars, or empty / null to clear
  // it and turn group chats off.
  groupActivationCode: z.union([
    z.string().trim().min(4).max(32),
    z.literal('').transform(() => null),
    z.null(),
  ]).optional(),
  // Per-bot group behaviour toggles (both default on at the DB level).
  groupTranscribeEnabled: z.boolean().optional(),
  groupMentionEnabled:    z.boolean().optional(),
}).strict();
// `displayName` is intentionally not editable here, fermi mirrors
// LINE's OA name through the connect / refresh flows so the two
// dashboards can't drift. To rename the bot, rename it in LINE
// Official Account Manager and hit "Sync from LINE".

export type ConnectBotInput = z.infer<typeof connectBotInputSchema>;
export type LineBotInput = z.infer<typeof lineBotInputSchema>;
export type UpdateBotInput = z.infer<typeof updateBotInputSchema>;
