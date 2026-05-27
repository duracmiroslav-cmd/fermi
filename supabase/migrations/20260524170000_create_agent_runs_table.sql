-- Creates the `agent_runs` table, one row per invocation of the
-- agent loop on a thread. Mirrors OpenAI's Assistants API "run"
-- concept: each user message produces a run, which holds a status
-- and the accumulated cost across all the LLM calls inside it.
-- Per-step timeline lives in `agent_run_steps`.
--
-- `bot_id` / `agent_id` / `owner_id` are denormalized snapshots so
-- dashboards can filter without joining through `threads` and
-- `bots` on every read. `agent_id` is a frozen snapshot, if a
-- bot's agent later changes, historical runs stay attributed to
-- the agent that actually handled them. A BEFORE INSERT trigger
-- fills the three from the run's thread so `startRun(threadId)`
-- doesn't have to pass them explicitly.

create table public.agent_runs (
  id              uuid primary key default gen_random_uuid(),
  thread_id       uuid not null references public.threads(id) on delete cascade,
  bot_id          uuid not null references public.bots(id)    on delete cascade,
  agent_id        uuid not null references public.agents(id)  on delete cascade,
  owner_id        uuid not null references public.users(id)   on delete cascade,
  status          text not null default 'running' check (status in (
                    'running',
                    'succeeded',
                    'failed'
                  )),
  total_cost_usd  numeric(10, 6) not null default 0,
  error_code      text,
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index agent_runs_thread_id_recent_idx
  on public.agent_runs(thread_id, created_at desc);

-- Per-bot and per-owner dashboard cards: "most recent runs for X".
create index agent_runs_bot_id_recent_idx
  on public.agent_runs(bot_id, created_at desc);

create index agent_runs_owner_id_recent_idx
  on public.agent_runs(owner_id, created_at desc);

create trigger agent_runs_set_updated_at
  before update on public.agent_runs
  for each row execute function public.set_updated_at();

-- BEFORE INSERT trigger fills the snapshot from the run's thread so
-- `startRun` keeps its single-arg `thread_id` API. Triggers fire on
-- service_role inserts too (RLS is bypassed, triggers are not),
-- which is exactly what we want.
create function public.fill_agent_run_snapshot() returns trigger
  language plpgsql
as $$
begin
  if new.bot_id is null or new.agent_id is null or new.owner_id is null then
    select b.id, b.agent_id, b.owner_id
      into new.bot_id, new.agent_id, new.owner_id
    from public.threads t
    join public.bots b on b.id = t.bot_id
    where t.id = new.thread_id;
  end if;
  return new;
end;
$$;

create trigger agent_runs_fill_snapshot
  before insert on public.agent_runs
  for each row execute function public.fill_agent_run_snapshot();

alter table public.agent_runs enable row level security;

-- Bot owners can debug their own agent loops. Mirrors the `messages`
-- visibility chain so trashed threads or bots hide their runs too.
create policy "Users can view their own agent runs." on public.agent_runs
  for select using (
    exists (
      select 1
      from public.threads t
      join public.bots b on b.id = t.bot_id
      where t.id = agent_runs.thread_id
        and t.deleted_at is null
        and b.owner_id = (select auth.uid())
        and b.deleted_at is null
    )
  );

-- Worker writes via service_role. Explicit revoke makes that hold
-- even if RLS were ever disabled on the table.
revoke insert, update, delete on public.agent_runs from authenticated;
