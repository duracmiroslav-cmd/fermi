-- Creates the `agent_run_steps` table, the timeline of events inside
-- one agent run: each LLM call, each LINE Reply attempt, each error.
-- `step` is the ordinal within its parent run (1, 2, 3, ...); to
-- compare timelines across runs, join through `agent_runs`.

create table public.agent_run_steps (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references public.agent_runs(id) on delete cascade,
  step              int not null,
  type              text not null check (type in (
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

-- Timeline view walks the steps of a run in order.
create index agent_run_steps_run_step_idx
  on public.agent_run_steps(run_id, step);

alter table public.agent_run_steps enable row level security;

-- Visibility follows the parent run (which itself follows thread → bot).
create policy "Users can view their own agent run steps." on public.agent_run_steps
  for select using (
    exists (
      select 1
      from public.agent_runs r
      join public.threads t on t.id = r.thread_id
      join public.bots b on b.id = t.bot_id
      where r.id = agent_run_steps.run_id
        and t.deleted_at is null
        and b.owner_id = (select auth.uid())
        and b.deleted_at is null
    )
  );

-- Worker writes via service_role. Explicit revoke makes that hold
-- even if RLS were ever disabled on the table.
revoke insert, update, delete on public.agent_run_steps from authenticated;
