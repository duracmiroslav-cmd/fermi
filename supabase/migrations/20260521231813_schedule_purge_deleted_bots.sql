-- purge_deleted_bots: hard-deletes all bots that have been in the
-- trash for longer than `older_than`. The target ids are materialized
-- up front so a concurrent restore that clears deleted_at between
-- the credential and bot deletes can't leave orphan credentials
-- behind.

create function public.purge_deleted_bots(
  older_than interval default interval '30 days'
) returns int
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_ids   uuid[];
  v_count int;
begin
  select array_agg(id) into v_ids
  from public.bots
  where deleted_at < now() - older_than;

  if v_ids is null then
    return 0;
  end if;

  delete from public.encrypted_credentials
  where bot_id = any(v_ids);

  delete from public.bots
  where id = any(v_ids);

  get diagnostics v_count = row_count;
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
