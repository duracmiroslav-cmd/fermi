-- Bumps the pgmq visibility timeout on `dequeue_webhook_events` from
-- 30s to 120s. With tool-calling agent loops (web_search → LLM →
-- LLM) a single run can take 40-60s; the old 30s ceiling let pgmq
-- re-deliver the same message mid-flight and the user got two
-- different replies. 120s sits above P99 handler time while still
-- being short enough that a truly dead worker doesn't strand the
-- user for long.
--
-- CREATE OR REPLACE preserves the existing service_role grants;
-- changing the default value is allowed as long as the parameter
-- signature stays identical.

create or replace function public.dequeue_webhook_events(
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
