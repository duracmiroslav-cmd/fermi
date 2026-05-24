-- purge_deleted_agents: hard-deletes agents that have been in the
-- trash for longer than `older_than`. Bot bindings were cleared on
-- soft-delete, so only the rows themselves remain to remove.

create function public.purge_deleted_agents(
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
    delete from public.agents
    where deleted_at < now() - older_than
    returning id
  )
  select count(*) into v_count from deleted;

  return v_count;
end;
$$;

revoke execute on function public.purge_deleted_agents(interval) from public;
grant  execute on function public.purge_deleted_agents(interval) to service_role;

-- Runs daily at 03:00 UTC. The 30-day default matches the trash
-- retention policy shown to users.
select cron.schedule(
  'purge-deleted-agents',
  '0 3 * * *',
  $$ select public.purge_deleted_agents(); $$
);
