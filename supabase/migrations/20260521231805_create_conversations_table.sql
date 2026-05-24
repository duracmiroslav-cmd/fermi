-- Creates the `conversations` table. Each row is the persistent
-- relationship between a bot and one external end-user (e.g., a LINE
-- userId). The end-user lives on the bot's platform and is not a
-- fermi account holder. Thread-level message history hangs off this
-- via the `threads` and `messages` tables.

create table public.conversations (
  id                    uuid primary key default gen_random_uuid(),
  bot_id                uuid not null references public.bots(id) on delete cascade,
  external_user_id      text not null,
  display_name          text,
  external_user_locale  text,
  is_active             boolean not null default true,
  last_message_at       timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  unique (bot_id, external_user_id)
);

create index conversations_bot_id_idx on public.conversations(bot_id);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;

-- Conversations are only visible while the parent bot is active
-- (not in the trash). Restoring the bot makes them visible again.
create policy "Users can view their own conversations." on public.conversations
  for select using (
    exists (
      select 1 from public.bots
      where bots.id = conversations.bot_id
        and bots.owner_id = (select auth.uid())
        and bots.deleted_at is null
    )
  );
