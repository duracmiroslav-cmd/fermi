import { z } from 'zod';

const lineChannelInputSchema = z.object({
  type: z.literal('line'),
  channelSecret: z.string().min(1, 'channelSecret is required'),
  channelAccessToken: z.string().min(1, 'channelAccessToken is required'),
});

export const connectChannelInputSchema = z.discriminatedUnion('type', [
  lineChannelInputSchema,
]);

export type ConnectChannelInput = z.infer<typeof connectChannelInputSchema>;
export type LineChannelInput = z.infer<typeof lineChannelInputSchema>;
