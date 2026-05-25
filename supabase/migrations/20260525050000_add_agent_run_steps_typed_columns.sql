-- Extracts model and token usage from `agent_run_steps.payload` into
-- first-class columns so dashboards can `GROUP BY model` or sum
-- tokens without a JSONB scan. Only `llm_responded` rows carry these
-- fields; for other step types the columns stay null.
--
-- A BEFORE INSERT trigger derives the columns from `payload->'usage'`
-- so callers don't need to pass them explicitly and the OpenRouter
-- response shape remains the source of truth.

alter table public.agent_run_steps
  add column model             text,
  add column prompt_tokens     int,
  add column completion_tokens int,
  add column cached_tokens     int;

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

-- Backfill existing llm_responded rows from their payloads.
update public.agent_run_steps
   set model             = payload->>'model',
       prompt_tokens     = (payload->'usage'->>'prompt_tokens')::int,
       completion_tokens = (payload->'usage'->>'completion_tokens')::int,
       cached_tokens     = (payload->'usage'->'prompt_tokens_details'->>'cached_tokens')::int
 where type = 'llm_responded';
