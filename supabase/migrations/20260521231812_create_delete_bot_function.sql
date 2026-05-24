-- delete_bot: moves a bot to the trash (soft-delete). Credentials are
-- preserved so the bot can be fully restored. Conversations become
-- invisible via RLS while deleted_at is set.
--
-- Raises bot_not_found (P0002) if the bot does not exist, is already
-- trashed, or belongs to a different owner.

create function public.delete_bot(
  p_bot_id   uuid,
  p_owner_id uuid
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Clearing agent_id releases the 1:1 binding so the agent can be
  -- attached to another bot without waiting on trash purge. Restore
  -- (when added) needs to rebind explicitly.
  update public.bots
    set deleted_at = now(),
        agent_id   = null
  where id        = p_bot_id
    and owner_id  = p_owner_id
    and deleted_at is null
  returning id into v_id;

  if v_id is null then
    raise exception 'bot_not_found' using errcode = 'P0002';
  end if;

  return v_id;
end;
$$;

revoke execute on function public.delete_bot(uuid, uuid) from public;
grant  execute on function public.delete_bot(uuid, uuid) to service_role;

-- permanently_delete_bot: hard-deletes a trashed bot and all its data.
-- Credentials are deleted first to free the unique key; the bot
-- hard-delete then cascades to conversations.
--
-- Only operates on bots already in the trash (deleted_at is not null)
-- so it cannot be used to bypass delete_bot. Raises bot_not_found
-- (P0002) if no matching trashed bot exists.

create function public.permanently_delete_bot(
  p_bot_id   uuid,
  p_owner_id uuid
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.bots
  where id       = p_bot_id
    and owner_id = p_owner_id
    and deleted_at is not null;

  if v_id is null then
    raise exception 'bot_not_found' using errcode = 'P0002';
  end if;

  delete from public.encrypted_credentials
  where bot_id = v_id;

  delete from public.bots
  where id = v_id;

  return v_id;
end;
$$;

revoke execute on function public.permanently_delete_bot(uuid, uuid) from public;
grant  execute on function public.permanently_delete_bot(uuid, uuid) to service_role;
