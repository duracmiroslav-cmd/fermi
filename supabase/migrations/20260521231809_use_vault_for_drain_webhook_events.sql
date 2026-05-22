-- Switches the `drain-webhook-events` cron job to read the service
-- role key from Supabase Vault. Managed Supabase does not grant the
-- `postgres` role permission to `alter database postgres set ...`, so
-- the GUC approach from the previous migration cannot be used.
--
-- After this migration applies, create the secret once from the
-- Supabase SQL editor:
--
--   select vault.create_secret('<service-role-key>', 'service_role_key');

select cron.unschedule('drain-webhook-events');

select cron.schedule(
  'drain-webhook-events',
  '* * * * * *',
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
