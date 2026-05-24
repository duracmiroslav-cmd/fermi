-- Extend `agent_run_steps.type` to record tool-calling turns. A single
-- LLM iteration that decides to call a tool emits two new rows:
--   tool_called    — the model asked to invoke <name>(<args>)
--   tool_responded — the tool returned <result>
-- Then the loop re-enters `llm_requested` for the next iteration with
-- the tool result appended to the message list.

alter table public.agent_run_steps
  drop constraint agent_run_steps_type_check;

alter table public.agent_run_steps
  add constraint agent_run_steps_type_check
  check (type in (
    'llm_requested',
    'llm_responded',
    'tool_called',
    'tool_responded',
    'push_succeeded',
    'push_failed',
    'error_occurred'
  ));
