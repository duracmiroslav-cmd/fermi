-- delete_channel: moves a channel to the trash (soft-delete).
-- Credentials are preserved so the channel can be fully restored.
-- Conversations become invisible via RLS while deleted_at is set.
--
-- Raises channel_not_found (P0002) if the channel does not exist,
-- is already trashed, or belongs to a different owner.

create function public.delete_channel(
  p_channel_id uuid,
  p_owner_id   uuid
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.channels
    set deleted_at = now()
  where id        = p_channel_id
    and owner_id  = p_owner_id
    and deleted_at is null
  returning id into v_id;

  if v_id is null then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;

  return v_id;
end;
$$;

revoke execute on function public.delete_channel(uuid, uuid) from public;
grant  execute on function public.delete_channel(uuid, uuid) to service_role;

-- permanently_delete_channel: hard-deletes a trashed channel and all
-- its data. Credentials are deleted first to free the unique key;
-- the channel hard-delete then cascades to conversations.
--
-- Only operates on channels already in the trash (deleted_at is not null)
-- so it cannot be used to bypass delete_channel.
-- Raises channel_not_found (P0002) if no matching trashed channel exists.

create function public.permanently_delete_channel(
  p_channel_id uuid,
  p_owner_id   uuid
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.channels
  where id       = p_channel_id
    and owner_id = p_owner_id
    and deleted_at is not null;

  if v_id is null then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;

  delete from public.encrypted_credentials
  where channel_id = v_id;

  delete from public.channels
  where id = v_id;

  return v_id;
end;
$$;

revoke execute on function public.permanently_delete_channel(uuid, uuid) from public;
grant  execute on function public.permanently_delete_channel(uuid, uuid) to service_role;
