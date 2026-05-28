-- Updates the per-agent config override on an `agent_capabilities`
-- binding. The supplied `p_config` is shallow-merged on top of the
-- capability's global defaults at runtime (see loadActiveCapabilities);
-- here we just store whatever the caller passes.
--
-- Raises:
--   agent_not_found   (P0002), missing / wrong owner / trashed
--   binding_not_found (P0002), capability not attached to this agent

create function public.update_capability_config(
  p_agent_id      uuid,
  p_owner_id      uuid,
  p_capability_id uuid,
  p_config        jsonb
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform 1 from public.agents
  where id = p_agent_id
    and owner_id = p_owner_id
    and deleted_at is null;
  if not found then
    raise exception 'agent_not_found' using errcode = 'P0002';
  end if;

  update public.agent_capabilities
  set config = p_config
  where agent_id      = p_agent_id
    and capability_id = p_capability_id;

  if not found then
    raise exception 'binding_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.update_capability_config(uuid, uuid, uuid, jsonb) from public;
grant  execute on function public.update_capability_config(uuid, uuid, uuid, jsonb) to service_role;
