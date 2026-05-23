import { z } from 'zod';

export const updateProfileInputSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  avatar_url: z.string().url().optional(),
}).strict();

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
