-- Creates the `agent_events` table, a per-step trace of agent loop
-- execution. The bot owner can read their own events to debug / tune
-- the persona; nobody writes from the client — the worker is the
-- only producer.

create table public.agent_events (
  id                uuid primary key default gen_random_uuid(),
  thread_id         uuid not null references public.threads(id) on delete cascade,
  step              int not null,
  type              text not null check (type in (
                      'worker_started',
                      'llm_request',
                      'llm_response',
                      'push_sent',
                      'push_failed',
                      'error'
                    )),
  payload           jsonb not null default '{}'::jsonb,
  latency_ms        int,
  cost_usd          numeric(10, 6),
  openrouter_gen_id text,
  created_at        timestamptz not null default now()
);

-- Timeline view walks events for a thread in order.
create index agent_events_thread_step_idx
  on public.agent_events(thread_id, step);

alter table public.agent_events enable row level security;

-- Bot owners can debug their own agent loops. Mirrors the `messages`
-- visibility chain so trashed threads or bots hide their events too.
create policy "Users can view their own agent events." on public.agent_events
  for select using (
    exists (
      select 1
      from public.threads t
      join public.bots b on b.id = t.bot_id
      where t.id = agent_events.thread_id
        and t.deleted_at is null
        and b.owner_id = (select auth.uid())
        and b.deleted_at is null
    )
  );

-- Worker writes via service_role. Explicit revoke makes that hold
-- even if RLS were ever disabled on the table.
revoke insert, update, delete on public.agent_events from authenticated;
