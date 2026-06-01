import type { SupabaseClient } from '@supabase/supabase-js';

// `scope` partitions the keyspace so two sources can never collide:
// a LINE webhookEventId and a Telegram update_id that share a string
// value land in disjoint scopes. Scope is required so no caller
// forgets it.
export const tryClaimIdempotencyKey = async (
  admin: SupabaseClient,
  scope: string,
  key: string,
): Promise<boolean> => {
  const { error: claimErr } = await admin
    .from('idempotency_keys')
    .insert({ scope, key });
  if (!claimErr) return true;
  // 23505 is Postgres' unique_violation, the key existed already,
  // which is the whole point of the dedup table.
  if ((claimErr as { code?: string }).code === '23505') return false;
  throw claimErr;
};
