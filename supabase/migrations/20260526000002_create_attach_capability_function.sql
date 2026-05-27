-- Attaches a capability to an agent (creates an `agent_capabilities`
-- row). Idempotent: re-attaching an already-bound capability is a
-- no-op, so callers don't need to check first.
--
-- Validation:
--   - agent must belong to the caller's owner and not be soft-deleted
--   - capability must be visible to the caller, builtin (owner_id
--     is null) or owned by the caller, and not soft-deleted
--
-- Raises:
--   agent_not_found        (P0002), missing / wrong owner / trashed
--   capability_not_found   (P0002), missing / not visible / trashed

create function public.attach_capability(
  p_agent_id      uuid,
  p_owner_id      uuid,
  p_capability_id uuid
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

  perform 1 from public.capabilities
  where id = p_capability_id
    and deleted_at is null
    and (owner_id is null or owner_id = p_owner_id);
  if not found then
    raise exception 'capability_not_found' using errcode = 'P0002';
  end if;

  insert into public.agent_capabilities (agent_id, capability_id)
  values (p_agent_id, p_capability_id)
  on conflict (agent_id, capability_id) do nothing;
end;
$$;

revoke execute on function public.attach_capability(uuid, uuid, uuid) from public;
grant  execute on function public.attach_capability(uuid, uuid, uuid) to service_role;
