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
