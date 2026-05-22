-- Creates the `drain-webhook-events` pg_cron job that POSTs to the
-- `agent` Edge Function every second via pg_net, draining the
-- `webhook_events` queue.
--
-- The job authenticates with the service role key read from a Postgres
-- GUC. Set it once after this migration applies (run from the Supabase
-- SQL editor):
--
--   alter database postgres set app.settings.service_role_key = '<key>';
--
-- The secret is intentionally kept out of source.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.schedule(
  'drain-webhook-events',
  '* * * * * *',
  $$
  select net.http_post(
    url := 'https://uysppyveyizzzkatafqq.supabase.co/functions/v1/agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    )
  );
  $$
);
