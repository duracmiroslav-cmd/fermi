import type { User } from '@supabase/supabase-js';
import type { H3Event } from 'h3';
import { serverSupabaseClient } from '#supabase/server';

// @nuxtjs/supabase's serverSupabaseUser returns user.id=undefined;
// the raw client.auth.getUser keeps the full row.
export const getCurrentUser = async (event: H3Event): Promise<User> => {
  const client = await serverSupabaseClient(event);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }
  return data.user;
};
