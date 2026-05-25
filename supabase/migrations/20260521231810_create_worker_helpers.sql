-- Creates the `dequeue_webhook_events` and `archive_webhook_event`
-- SECURITY DEFINER wrappers the Edge Function worker uses to drain
-- the `webhook_events` queue without touching the `pgmq` schema
-- directly.
--
-- Granted to service_role only; anon and authenticated cannot
-- consume the queue.
--
-- `visibility_timeout` defaults to 120s: a tool-calling agent loop
-- (web_search → LLM → LLM) can take 40-60s end-to-end, and anything
-- below that ceiling lets pgmq redeliver mid-flight so the user
-- gets two different replies. 120s sits above P99 handler time
-- while still being short enough that a truly dead worker doesn't
-- strand the user for long.

create function public.dequeue_webhook_events(
  batch_size integer default 10,
  visibility_timeout integer default 120
)
returns table (msg_id bigint, payload jsonb)
  language sql
  security definer
  set search_path = public
as $$
  select msg_id, message as payload
  from pgmq.read('webhook_events', visibility_timeout, batch_size);
$$;

revoke execute on function public.dequeue_webhook_events(integer, integer) from public;
grant execute on function public.dequeue_webhook_events(integer, integer) to service_role;

create function public.archive_webhook_event(msg_id bigint) returns boolean
  language sql
  security definer
  set search_path = public
as $$
  select pgmq.archive('webhook_events', msg_id);
$$;

revoke execute on function public.archive_webhook_event(bigint) from public;
grant execute on function public.archive_webhook_event(bigint) to service_role;
