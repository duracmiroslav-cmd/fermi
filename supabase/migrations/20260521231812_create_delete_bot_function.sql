-- Creates the `delete_bot` function that moves a bot to the trash
-- (soft-delete). Credentials linger until `purge_orphaned_credentials`
-- sweeps them at 30 days, so a bot restored before then keeps its
-- LINE connection; after that the bot can still be restored but
-- credentials need to be re-pasted from the LINE Developer Console.
--
-- The `agent_id` binding stays intact: with the 1 agent : N bots
-- model, soft-deleted bots referencing an agent don't block
-- anything (`delete_agent`'s in-use check filters `deleted_at`).
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
  update public.bots
    set deleted_at = now()
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
