-- Creates the `messages` table, one row per turn (user / assistant /
-- tool) inside a thread. `content` is jsonb so the same row shape
-- carries text, image refs, tool calls, and tool results.

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  thread_id       uuid not null references public.threads(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'tool')),
  content         jsonb not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index messages_thread_id_created_idx
  on public.messages(thread_id, created_at);

create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

alter table public.messages enable row level security;

create policy "Users can view their own messages." on public.messages
  for select using (
    exists (
      select 1
      from public.threads t
      join public.bots b on b.id = t.bot_id
      where t.id = messages.thread_id
        and t.deleted_at is null
        and b.owner_id = (select auth.uid())
        and b.deleted_at is null
    )
  );

-- Messages are written by the agent worker via service_role only.
revoke insert, update, delete on public.messages from authenticated;
