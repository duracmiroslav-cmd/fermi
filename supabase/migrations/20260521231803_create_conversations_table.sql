-- Creates the `conversations` table, where each row is a thread between
-- a channel and one external end-user. The end-user lives in the
-- channel's external platform and is not a fermi account holder.

create table public.conversations (
  id                    uuid primary key default gen_random_uuid(),
  channel_id            uuid not null references public.channels(id) on delete cascade,
  external_user_id      text not null,
  display_name          text,
  external_user_locale  text,
  is_active             boolean not null default true,
  last_message_at       timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  unique (channel_id, external_user_id)
);

create index conversations_channel_id_idx on public.conversations(channel_id);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;

create policy "Users can view their own conversations." on public.conversations
  for select using (
    exists (
      select 1 from public.channels
      where channels.id = conversations.channel_id
        and channels.owner_id = auth.uid()
    )
  );
