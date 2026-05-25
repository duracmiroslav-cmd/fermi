-- Soft-deletes an agent. Blocks two cases:
--   1. Target is the user's Default — `agents.is_default` is a
--      one-per-owner invariant.
--   2. Target has live bots bound — `bots.agent_id` is NOT NULL
--      with ON DELETE RESTRICT (caller rebinds first).
--
-- Raises:
--   agent_not_found              (P0002) — missing / wrong owner / already trashed
--   cannot_delete_default_agent  (P0001) — target is Default
--   agent_in_use                 (P0001) — target has live bots bound

create function public.delete_agent(
  p_agent_id uuid,
  p_owner_id uuid
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_id uuid;
  v_is_default boolean;
  v_bot_count int;
begin
  select is_default into v_is_default
  from public.agents
  where id = p_agent_id
    and owner_id = p_owner_id
    and deleted_at is null;

  if v_is_default is null then
    raise exception 'agent_not_found' using errcode = 'P0002';
  end if;

  if v_is_default then
    raise exception 'cannot_delete_default_agent' using errcode = 'P0001';
  end if;

  select count(*) into v_bot_count
  from public.bots
  where agent_id = p_agent_id and deleted_at is null;

  if v_bot_count > 0 then
    raise exception 'agent_in_use' using errcode = 'P0001';
  end if;

  update public.agents
    set deleted_at = now()
  where id = p_agent_id
    and owner_id = p_owner_id
    and deleted_at is null
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.delete_agent(uuid, uuid) from public;
grant  execute on function public.delete_agent(uuid, uuid) to service_role;
