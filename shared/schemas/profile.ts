import { z } from 'zod';
import { SUPPORTED_LOCALES } from '../locale';

// An unknown zone makes Intl.DateTimeFormat throw RangeError; constructing it
// is enough to validate without formatting anything. Guards the DB so a bad
// value can't slip past and break the worker's time context.
const isValidTimezone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const updateProfileInputSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  locale:       z.enum(SUPPORTED_LOCALES).optional(),
  timezone:     z.string().refine(isValidTimezone, 'Invalid IANA timezone').optional(),
  avatar_url:   z.string().url().optional(),
}).strict();

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
