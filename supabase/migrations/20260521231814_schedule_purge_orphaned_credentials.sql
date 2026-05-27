-- Creates the `purge_orphaned_credentials` function and a daily
-- pg_cron job that deletes credentials whose parent bot has been in
-- the trash longer than 30 days. Content (bot row, conversations,
-- threads, messages) is intentionally left alone, the system never
-- auto-purges history; only secrets have a retention ceiling, for
-- security hygiene.

create function public.purge_orphaned_credentials(
  older_than interval default interval '30 days'
) returns int
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_count int;
begin
  with deleted as (
    delete from public.encrypted_credentials
    where bot_id in (
      select id from public.bots
      where deleted_at < now() - older_than
    )
    returning id
  )
  select count(*) into v_count from deleted;

  return v_count;
end;
$$;

revoke execute on function public.purge_orphaned_credentials(interval) from public;
grant  execute on function public.purge_orphaned_credentials(interval) to service_role;

-- Runs daily at 03:00 UTC.
select cron.schedule(
  'purge-orphaned-credentials',
  '0 3 * * *',
  $$ select public.purge_orphaned_credentials(); $$
);
