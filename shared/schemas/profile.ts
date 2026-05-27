import { z } from 'zod';
import { SUPPORTED_LOCALES } from '../locale';

export const updateProfileInputSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  locale:       z.enum(SUPPORTED_LOCALES).optional(),
  timezone:     z.string().optional(),
  avatar_url:   z.string().url().optional(),
}).strict();

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
