import type { H3Event } from 'h3';
import { z } from 'zod';

const uuidSchema = z.string().uuid();

export const getUuidParam = (event: H3Event, name: string): string => {
  const value = getRouterParam(event, name);
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' });
  }
  return parsed.data;
};
