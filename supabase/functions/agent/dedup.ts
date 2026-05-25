import type { SupabaseClient } from '@supabase/supabase-js';

// Tries to claim an idempotency key. Returns true when the key was
// new (caller proceeds), false when it was already seen (caller
// skips). `scope` partitions the keyspace so two different sources
// can never collide — a LINE webhookEventId and a Telegram update_id
// that happen to share a string value land in disjoint scopes.
// Caller-supplied scope is required; the helper enforces format so
// no one forgets it.
//
// Backed by `public.idempotency_keys` (composite PK on scope + key);
// rows are GC'd by the daily `purge-idempotency-keys` cron at 03:15
// UTC, which accepts an optional p_scope for per-scope retention.
export const tryClaimIdempotencyKey = async (
  admin: SupabaseClient,
  scope: string,
  key: string,
): Promise<boolean> => {
  const { error: claimErr } = await admin
    .from('idempotency_keys')
    .insert({ scope, key });
  if (!claimErr) return true;
  // 23505 is Postgres' unique_violation — the key existed already,
  // which is the whole point of the dedup table.
  if ((claimErr as { code?: string }).code === '23505') return false;
  throw claimErr;
};
