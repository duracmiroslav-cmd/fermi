-- Renames `agent_run_steps.type` values to a single grammatical
-- form: `<subject>_<past_verb>`. The original mix
-- (`llm_request` / `llm_response` as nouns, `push_sent` / `push_failed`
-- as past verbs, bare `error`) conflated artifact-style and event-style
-- naming. Each row in `agent_run_steps` is a thing that happened, so
-- past-verb form fits the table's semantics and matches the Stripe /
-- GitHub webhook convention (`charge.succeeded`, `pull_request.opened`).

-- Migrate existing rows in place. The table is brand-new (created the
-- same day as this rename) so volume is tiny, but doing it under a
-- transaction keeps things tidy if any rows have landed.
update public.agent_run_steps set type = 'llm_requested'  where type = 'llm_request';
update public.agent_run_steps set type = 'llm_responded'  where type = 'llm_response';
update public.agent_run_steps set type = 'push_succeeded' where type = 'push_sent';
update public.agent_run_steps set type = 'error_occurred' where type = 'error';
-- `push_failed` already fits the new convention, no row update needed.

alter table public.agent_run_steps
  drop constraint agent_run_steps_type_check;

alter table public.agent_run_steps
  add constraint agent_run_steps_type_check
  check (type in (
    'llm_requested',
    'llm_responded',
    'push_succeeded',
    'push_failed',
    'error_occurred'
  ));
