import type { SupabaseClient } from '@supabase/supabase-js';

export const enqueueWebhookEvent = async (
  admin: SupabaseClient,
  payload: unknown,
): Promise<number> => {
  const { data, error } = await admin.rpc('enqueue_webhook_event', { payload });
  if (error) throw error;
  return data as number;
};
