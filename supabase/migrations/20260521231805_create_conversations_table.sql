-- Creates the `conversations` table, the persistent relationship
-- between a bot and one external end-user (e.g., a LINE userId). The
-- end-user lives on the bot's platform and is not a fermi account
-- holder. Thread-level message history hangs off this via `threads`
-- and `messages`.

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

-- Hidden while either the conversation itself or its parent bot is in
-- the trash. Restoring either makes it visible again.
create policy "Users can view their own conversations." on public.conversations
  for select using (
    deleted_at is null
    and exists (
      select 1 from public.bots
      where bots.id = conversations.bot_id
        and bots.owner_id = (select auth.uid())
        and bots.deleted_at is null
    )
  );

-- Conversations are mutated server-side via service_role only.
revoke insert, update, delete on public.conversations from authenticated;
