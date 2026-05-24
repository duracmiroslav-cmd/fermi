-- Creates the `threads` table. A thread is a discrete session within
-- a conversation; the `/new` command opens a fresh thread, and LINE
-- routes incoming messages to the latest by `last_message_at`.

create table public.threads (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references public.conversations(id) on delete cascade,
  title             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_message_at   timestamptz not null default now()
);

-- Latest-thread lookup per conversation walks this index in descending
-- order to find the active session in one read.
create index threads_conversation_id_recent_idx
  on public.threads(conversation_id, last_message_at desc);

create trigger threads_set_updated_at
  before update on public.threads
  for each row execute function public.set_updated_at();

alter table public.threads enable row level security;

create policy "Users can view their own threads." on public.threads
  for select using (
    exists (
      select 1
      from public.conversations c
      join public.bots b on b.id = c.bot_id
      where c.id = threads.conversation_id
        and c.deleted_at is null
        and b.owner_id = (select auth.uid())
        and b.deleted_at is null
    )
  );
