-- Creates the `agent_runs` table, one row per invocation of the
-- agent loop on a thread. Mirrors OpenAI's Assistants API "run"
-- concept: each user message produces a run, which holds a status
-- and the accumulated cost across all the LLM calls inside it.
-- Per-step detail (the actual llm_request / llm_response / push_*
-- timeline) lives in `agent_run_steps`.

create table public.agent_runs (
  id              uuid primary key default gen_random_uuid(),
  thread_id       uuid not null references public.threads(id) on delete cascade,
  status          text not null default 'running' check (status in (
                    'running',
                    'succeeded',
                    'failed'
                  )),
  total_cost_usd  numeric(10, 6) not null default 0,
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index agent_runs_thread_id_recent_idx
  on public.agent_runs(thread_id, created_at desc);

create trigger agent_runs_set_updated_at
  before update on public.agent_runs
  for each row execute function public.set_updated_at();

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
