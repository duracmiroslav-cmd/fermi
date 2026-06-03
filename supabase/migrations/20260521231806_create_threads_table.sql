-- Creates the `threads` table, the persistent chat between a bot and
-- one conversation subject — a `user` (1:1, a LINE userId) or a
-- `group` (a LINE groupId). Mirrors OpenAI's Assistants API "thread"
-- concept: a subject can have multiple threads on the same bot (each
-- `/new` opens a fresh one), and the worker routes incoming messages
-- to the latest by `last_message_at`.

create table public.threads (
  id                  uuid primary key default gen_random_uuid(),
  bot_id              uuid not null references public.bots(id) on delete cascade,
  subject_type        text not null default 'user' check (subject_type in ('user', 'group')),
  subject_external_id text not null,
  last_message_at     timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

-- Latest-thread routing: `(bot, subject_type, subject_external_id)`
-- filter walks this index in descending `last_message_at` order to
-- find the active session in one read. Partial on `deleted_at is null`
-- so trashed threads don't shadow active ones.
create index threads_bot_subject_recent_idx
  on public.threads(bot_id, subject_type, subject_external_id, last_message_at desc)
  where deleted_at is null;

create trigger threads_set_updated_at
  before update on public.threads
  for each row execute function public.set_updated_at();

alter table public.threads enable row level security;

-- Hidden while either the thread itself or its parent bot is in the
-- trash. Restoring either makes it visible again.
create policy "Users can view their own threads." on public.threads
  for select using (
    deleted_at is null
    and exists (
      select 1 from public.bots
      where bots.id = threads.bot_id
        and bots.owner_id = (select auth.uid())
        and bots.deleted_at is null
    )
  );

-- Threads are written by the agent worker via service_role only.
revoke insert, update, delete on public.threads from authenticated;
