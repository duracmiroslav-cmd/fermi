-- Detaches a capability from an agent (deletes the
-- `agent_capabilities` row). Idempotent: detaching an unbound
-- capability is a no-op.
--
-- The binding's `config` jsonb is lost on detach; re-attach starts
-- from default config. For "temporarily pause without losing
-- config", use the `disabled_at` switch (future toggle RPC).
--
-- Raises:
--   agent_not_found  (P0002) — missing / wrong owner / trashed

create function public.detach_capability(
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

  delete from public.agent_capabilities
  where agent_id = p_agent_id
    and capability_id = p_capability_id;
end;
$$;

revoke execute on function public.detach_capability(uuid, uuid, uuid) from public;
grant  execute on function public.detach_capability(uuid, uuid, uuid) to service_role;
