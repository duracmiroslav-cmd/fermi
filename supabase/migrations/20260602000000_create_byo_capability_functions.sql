-- BYO (bring-your-own) MCP capability lifecycle: a user registers a
-- custom MCP server as an owned `capabilities` row (owner_id set), then
-- removes it. Distinct from attach/detach (which bind a capability to an
-- agent) — these manage the catalog row itself, and only ever touch the
-- caller's own rows, never built-ins (owner_id null).

-- Creates an owned MCP capability and returns its id. The bearer token
-- (if any) is stored separately by the caller in encrypted_credentials
-- under (owner, byo_mcp, <returned id>).
--
-- Raises:
--   invalid_auth_key_type (22023), p_auth_key_type not null and not 'byo_mcp'
--   invalid_url           (22023), p_url not an http(s) URL
--   capability_slug_taken (23505), owner already has an active row at p_slug

create function public.create_byo_capability(
  p_owner_id       uuid,
  p_slug           text,
  p_display_name   text,
  p_url            text,
  p_auth_key_type  text default null,
  p_description    text default null
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Security boundary (BYO MCP prereq a). A user-created capability may
  -- carry only the dedicated byo_mcp key type, or no auth. Allowing an
  -- arbitrary key_type would let a user point a BYO server at an endpoint
  -- they control and have fermi send a high-value provider key (anthropic
  -- / openrouter / github / …) as the bearer — credential exfiltration.
  if p_auth_key_type is not null and p_auth_key_type <> 'byo_mcp' then
    raise exception 'invalid_auth_key_type' using errcode = '22023';
  end if;

  -- Light shape check only; the connect endpoint runs the SSRF guard
  -- (resolveAndValidate) before this is ever called.
  if p_url !~* '^https?://' then
    raise exception 'invalid_url' using errcode = '22023';
  end if;

  insert into public.capabilities (owner_id, slug, display_name, description, config)
  values (
    p_owner_id,
    p_slug,
    p_display_name,
    p_description,
    jsonb_build_object('url', p_url)
      || case
           when p_auth_key_type is not null
           then jsonb_build_object('authKeyType', p_auth_key_type)
           else '{}'::jsonb
         end
  )
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'capability_slug_taken' using errcode = '23505';
end;
$$;

-- Soft-deletes the caller's own MCP capability and drops its stored
-- bearer token. The row is kept (deleted_at set) so existing
-- agent_capabilities bindings stop contributing tools via the
-- deleted_at filter in loadActiveCapabilities, and the slug frees up for
-- re-add. The token is hard-deleted now rather than lingering at rest
-- for a server the user removed.
--
-- Raises:
--   capability_not_found (P0002), missing / not owned / built-in / trashed

create function public.delete_byo_capability(
  p_owner_id      uuid,
  p_capability_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  update public.capabilities
  set deleted_at = now()
  where id = p_capability_id
    and owner_id = p_owner_id
    and deleted_at is null;
  if not found then
    raise exception 'capability_not_found' using errcode = 'P0002';
  end if;

  delete from public.encrypted_credentials
  where capability_id = p_capability_id
    and user_id = p_owner_id;
end;
$$;

revoke execute on function public.create_byo_capability(uuid, text, text, text, text, text) from public;
grant  execute on function public.create_byo_capability(uuid, text, text, text, text, text) to service_role;
revoke execute on function public.delete_byo_capability(uuid, uuid) from public;
grant  execute on function public.delete_byo_capability(uuid, uuid) to service_role;
