-- delete_agent: moves an agent to the trash and clears the binding on
-- any bot still pointing to it. Releasing the binding lets the bot be
-- attached to a different agent without waiting for trash purge.
--
-- Raises agent_not_found (P0002) if the agent does not exist, is
-- already trashed, or belongs to a different owner.

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
begin
  update public.agents
    set deleted_at = now()
  where id        = p_agent_id
    and owner_id  = p_owner_id
    and deleted_at is null
  returning id into v_id;

  if v_id is null then
    raise exception 'agent_not_found' using errcode = 'P0002';
  end if;

  update public.bots
    set agent_id = null
  where agent_id = v_id;

  return v_id;
end;
$$;

revoke execute on function public.delete_agent(uuid, uuid) from public;
grant  execute on function public.delete_agent(uuid, uuid) to service_role;

-- permanently_delete_agent: hard-deletes a trashed agent. Bindings
-- were already cleared by delete_agent so there is nothing else to
-- unwind here.
--
-- Raises agent_not_found (P0002) if no matching trashed agent exists.

create function public.permanently_delete_agent(
  p_agent_id uuid,
  p_owner_id uuid
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_id uuid;
begin
  delete from public.agents
  where id       = p_agent_id
    and owner_id = p_owner_id
    and deleted_at is not null
  returning id into v_id;

  if v_id is null then
    raise exception 'agent_not_found' using errcode = 'P0002';
  end if;

  return v_id;
end;
$$;

revoke execute on function public.permanently_delete_agent(uuid, uuid) from public;
grant  execute on function public.permanently_delete_agent(uuid, uuid) to service_role;
