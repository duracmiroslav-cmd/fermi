-- Creates the `webhook_events` pgmq queue and the
-- `enqueue_webhook_event` SECURITY DEFINER wrapper. The Nuxt webhook
-- handler enqueues via the wrapper instead of touching the `pgmq`
-- schema directly.
--
-- Granted to service_role only; anon and authenticated cannot
-- enqueue, so a leaked anon key cannot flood the queue.

create extension if not exists pgmq;

-- `supabase db reset --linked` only drops the public schema; pgmq
-- tables linger in the pgmq schema and a re-run of pgmq.create()
-- against partial leftover state (tables present, sequence missing)
-- errors out. Drop first to start from a clean slate.
do $$ begin
  perform pgmq.drop_queue('webhook_events');
exception when others then null;
end $$;

select pgmq.create('webhook_events');

-- Enqueue and immediately trigger the worker from Postgres. The webhook
-- handler's own fire-and-forget trigger can't survive the serverless freeze
-- that follows its LINE ACK, so it loses the trigger at random and the event
-- waits for the next minute-aligned pg_cron drain (~tens of seconds). Firing
-- net.http_post here, from the always-on DB, makes the trigger reliable so an
-- event drains in seconds. net (pg_net) and the vault secret are created in
-- the drain-webhook-events cron migration; both resolve at call time, not at
-- function-creation time, so the ordering across migrations is fine. That
-- cron stays as the fallback.
create function public.enqueue_webhook_event(payload jsonb) returns bigint
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  msg_id bigint;
begin
  msg_id := pgmq.send('webhook_events', payload);
  perform net.http_post(
    url := 'https://uysppyveyizzzkatafqq.supabase.co/functions/v1/agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    )
  );
  return msg_id;
end;
$$;

revoke execute on function public.enqueue_webhook_event(jsonb) from public;
grant execute on function public.enqueue_webhook_event(jsonb) to service_role;
