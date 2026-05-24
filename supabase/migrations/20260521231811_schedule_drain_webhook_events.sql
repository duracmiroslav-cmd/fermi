-- Creates the `drain-webhook-events` pg_cron job that POSTs to the
-- `agent` Edge Function once a minute, draining the `webhook_events`
-- queue. Sub-minute scheduling is not available on managed Supabase,
-- so latency-sensitive paths trigger the worker directly from the
-- webhook handler; this cron is the fallback.
--
-- The job authenticates with the service role key read from Supabase
-- Vault. Before the cron can succeed, create the secret once from the
-- Supabase SQL editor:
--
--   select vault.create_secret('<service-role-key>', 'service_role_key');

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.schedule(
  'drain-webhook-events',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://uysppyveyizzzkatafqq.supabase.co/functions/v1/agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'service_role_key'
      )
    )
  );
  $$
);
