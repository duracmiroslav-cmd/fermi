-- Adds an idempotency store the worker consults before starting an
-- agent run. Platform-agnostic: the key is whatever the webhook
-- handler supplies (LINE → `webhookEventId`; future Telegram →
-- `update_id`; etc.). The worker never learns the key's origin.
--
-- This closes the duplicate-reply race that the VT bump
-- (`_bump_webhook_visibility_timeout`) only narrows: even with a
-- generous 120s timeout, pgmq's at-least-once semantics or a LINE
-- webhook retry could still re-deliver an event. A try-insert on
-- the PK turns "second delivery" into a no-op.
--
-- Retention: LINE itself stops retrying webhooks well within 24h;
-- 48h gives a generous safety margin without unbounded growth.

create table public.idempotency_keys (
  key     text primary key,
  seen_at timestamptz not null default now()
);

alter table public.idempotency_keys enable row level security;

-- Worker writes via service_role (bypasses RLS); no authenticated
-- consumer should ever read or write this table.
revoke all on public.idempotency_keys from anon, authenticated;

create function public.purge_idempotency_keys(
  older_than interval default interval '48 hours'
) returns int
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_count int;
begin
  with deleted as (
    delete from public.idempotency_keys
    where seen_at < now() - older_than
    returning key
  )
  select count(*) into v_count from deleted;

  return v_count;
end;
$$;

revoke execute on function public.purge_idempotency_keys(interval) from public;
grant  execute on function public.purge_idempotency_keys(interval) to service_role;

-- Runs daily at 03:15 UTC (15 minutes after the orphaned-credentials
-- purge to spread load).
select cron.schedule(
  'purge-idempotency-keys',
  '15 3 * * *',
  $$ select public.purge_idempotency_keys(); $$
);
