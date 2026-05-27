-- Creates the `agent_run_steps` table, the timeline of events inside
-- one agent run: each LLM call, each tool invocation, each LINE Push
-- attempt, each error. `step` is the ordinal within its parent run
-- (1, 2, 3, ...); to compare timelines across runs, join through
-- `agent_runs`.
--
-- Type values use past-verb form (`<subject>_<past_verb>`), each
-- row is a thing that happened. Matches Stripe / GitHub webhook
-- conventions (`charge.succeeded`, `pull_request.opened`).
--
-- `model` / `prompt_tokens` / `completion_tokens` / `cached_tokens`
-- are extracted from `payload->'usage'` by a BEFORE INSERT trigger
-- so dashboards can `GROUP BY model` or sum tokens without a JSONB
-- scan. Only `llm_responded` rows carry them; null elsewhere.

create table public.agent_run_steps (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references public.agent_runs(id) on delete cascade,
  step              int not null,
  type              text not null check (type in (
                      'llm_requested',
                      'llm_responded',
                      'tool_called',
                      'tool_responded',
                      'push_succeeded',
                      'push_failed',
                      'error_occurred'
                    )),
  payload           jsonb not null default '{}'::jsonb,
  model             text,
  prompt_tokens     int,
  completion_tokens int,
  cached_tokens     int,
  latency_ms        int,
  cost_usd          numeric(10, 6),
  openrouter_gen_id text,
  created_at        timestamptz not null default now()
);

-- Timeline view walks the steps of a run in order.
create index agent_run_steps_run_step_idx
  on public.agent_run_steps(run_id, step);

-- Derives model + token usage from `payload->'usage'` so callers
-- pass just the raw OpenRouter response and that response stays the
-- single source of truth.
create function public.fill_agent_run_step_usage() returns trigger
  language plpgsql
as $$
begin
  if new.type = 'llm_responded' then
    new.model             := coalesce(new.model,             new.payload->>'model');
    new.prompt_tokens     := coalesce(new.prompt_tokens,     (new.payload->'usage'->>'prompt_tokens')::int);
    new.completion_tokens := coalesce(new.completion_tokens, (new.payload->'usage'->>'completion_tokens')::int);
    new.cached_tokens     := coalesce(new.cached_tokens,     (new.payload->'usage'->'prompt_tokens_details'->>'cached_tokens')::int);
  end if;
  return new;
end;
$$;

create trigger agent_run_steps_fill_usage
  before insert on public.agent_run_steps
  for each row execute function public.fill_agent_run_step_usage();

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
