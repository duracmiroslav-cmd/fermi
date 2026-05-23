-- Each row is an external messaging endpoint (currently a LINE OA)
-- owned by a fermi account.

create table public.channels (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.users(id) on delete cascade,
  channel_type  text not null default 'line' check (channel_type in ('line')),
  external_id   text not null,
  display_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- Soft-deleted rows release the (channel_type, external_id) key so a
-- disconnected channel can be reconnected or claimed by another account.
create unique index channels_active_external_id_uq
  on public.channels (channel_type, external_id)
  where deleted_at is null;

create index channels_owner_id_idx on public.channels(owner_id);

create trigger channels_set_updated_at
  before update on public.channels
  for each row execute function public.set_updated_at();

alter table public.channels enable row level security;

create policy "Users can view their own channels." on public.channels
  for select using (auth.uid() = owner_id);

-- Locks the owner's users row before counting + inserting so two
-- concurrent connects from the same user can't both observe an
-- under-limit count and bypass the tier quota.
create function public.insert_channel_if_under_limit(
  p_owner_id     uuid,
  p_channel_type text,
  p_external_id  text,
  p_display_name text,
  p_limit        int
) returns table (id uuid, display_name text)
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  current_count int;
begin
  perform 1 from public.users where public.users.id = p_owner_id for update;

  select count(*) into current_count
  from public.channels
  where owner_id = p_owner_id and deleted_at is null;

  if current_count >= p_limit then
    raise exception 'channel_limit_reached' using errcode = 'P0001';
  end if;

  return query
    insert into public.channels (owner_id, channel_type, external_id, display_name)
    values (p_owner_id, p_channel_type, p_external_id, p_display_name)
    returning channels.id, channels.display_name;
end;
$$;

revoke execute on function public.insert_channel_if_under_limit(uuid, text, text, text, int) from public;
grant execute on function public.insert_channel_if_under_limit(uuid, text, text, text, int) to service_role;
