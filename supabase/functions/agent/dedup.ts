import type { SupabaseClient } from '@supabase/supabase-js';

// Tries to claim an idempotency key. Returns true when the key was
// new (caller proceeds), false when it was already seen (caller
// skips). The stored key is `<namespace>:<key>` so that two
// different sources can never collide — a LINE webhookEventId and a
// Telegram update_id that happen to share a string value still land
// in disjoint namespaces. Caller-supplied namespace is required;
// the helper enforces format so no one forgets the prefix.
//
// Backed by `public.idempotency_keys`; rows are GC'd by the daily
// `purge-idempotency-keys` cron at 03:15 UTC.
export const tryClaimIdempotencyKey = async (
  admin: SupabaseClient,
  namespace: string,
  key: string,
): Promise<boolean> => {
  const { error: claimErr } = await admin
    .from('idempotency_keys')
    .insert({ key: `${namespace}:${key}` });
  if (!claimErr) return true;
  // 23505 is Postgres' unique_violation — the key existed already,
  // which is the whole point of the dedup table.
  if ((claimErr as { code?: string }).code === '23505') return false;
  throw claimErr;
};
