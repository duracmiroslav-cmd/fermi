-- Creates the `channels` table, where each row is an external messaging
-- endpoint (currently a LINE OA) owned by a fermi account. Channel-level
-- credentials live in `encrypted_credentials` and reference this table by
-- `channel_id`.

create table public.channels (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.users(id) on delete cascade,
  channel_type  text not null default 'line' check (channel_type in ('line')),
  external_id   text not null,
  display_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (channel_type, external_id)
);

create index channels_owner_id_idx on public.channels(owner_id);

create trigger channels_set_updated_at
  before update on public.channels
  for each row execute function public.set_updated_at();

alter table public.channels enable row level security;

create policy "Users can view their own channels." on public.channels
  for select using (auth.uid() = owner_id);
