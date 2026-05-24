-- purge_deleted_bots: hard-deletes all bots that have been in the
-- trash for longer than `older_than`. For each bot:
--   1. credentials are deleted first (frees the unique key)
--   2. bot row is hard-deleted (conversations cascade via FK)

create function public.purge_deleted_bots(
  older_than interval default interval '30 days'
) returns int
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.encrypted_credentials
  where bot_id in (
    select id from public.bots
    where deleted_at < now() - older_than
  );

  with deleted as (
    delete from public.bots
    where deleted_at < now() - older_than
    returning id
  )
  select count(*) into v_count from deleted;

  return v_count;
end;
$$;

revoke execute on function public.purge_deleted_bots(interval) from public;
grant  execute on function public.purge_deleted_bots(interval) to service_role;

-- Runs daily at 03:00 UTC. The 30-day default matches the trash
-- retention policy shown to users.
select cron.schedule(
  'purge-deleted-bots',
  '0 3 * * *',
  $$ select public.purge_deleted_bots(); $$
);
