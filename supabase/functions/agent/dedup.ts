import type { SupabaseClient } from '@supabase/supabase-js';

// Tries to claim an idempotency key. Returns true when the key was
// new (caller proceeds), false when it was already seen (caller
// skips). Platform-agnostic by design: callers supply whatever
// uniquely identifies the unit of work (LINE webhookEventId,
// Telegram update_id, internal request id, etc.) and the worker
// never has to know what kind of key it is.
//
// Backed by `public.idempotency_keys`; rows are GC'd by the daily
// `purge-idempotency-keys` cron at 03:15 UTC.
export const tryClaimIdempotencyKey = async (
  admin: SupabaseClient,
  key: string,
): Promise<boolean> => {
  const { error: claimErr } = await admin
    .from('idempotency_keys')
    .insert({ key });
  if (!claimErr) return true;
  // 23505 is Postgres' unique_violation — the key existed already,
  // which is the whole point of the dedup table.
  if ((claimErr as { code?: string }).code === '23505') return false;
  throw claimErr;
};
