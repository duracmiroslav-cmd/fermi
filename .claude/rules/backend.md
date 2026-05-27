---
paths:
  - "server/**/*.ts"
  - "shared/**/*.ts"
  - "supabase/functions/**/*.ts"
  - "supabase/migrations/**/*.sql"
---

# Backend Rules

## File / module naming: grammatical number

A module file's name takes the grammatical number of its subject, not its standing as a module. A countable entity, or a collection of them, is plural; a mass noun, a single concept, or a single action is singular. Countability is the deciding axis — "is this a module or a collection" never discriminates, since every file here is a module. The number must agree with the same subject named elsewhere in the codebase and with its database table.

## Enum / state values: past-verb form

DB enum strings (CHECK-constrained `text` columns) and their TS unions use `<subject>_<past_verb>` form. Reads as "X happened to Y".

### Examples in this codebase

| Column | Values |
|---|---|
| `agent_run_steps.type` | `llm_requested` / `llm_responded` / `tool_called` / `tool_responded` / `push_succeeded` / `push_failed` / `error_occurred` |
| `agent_runs.status` | `succeeded` / `failed` (plus `running` — in-progress state, not an event) |
| `agent_runs.error_code` | `rate_limited` / `timed_out` / `upstream_failed` / `unknown` (catch-all) |

### Why

- Reads consistently across the system: dashboards group by "what happened"
- Matches Stripe (`charge.succeeded`) / GitHub webhook (`pull_request.opened`) conventions
- In-progress states (`running`) and catch-alls (`unknown`) are allowed exceptions — they describe a state-of-being, not a past event

### When adding a new value

1. **DB** — depends on launch stage:
   - **Pre-launch**: edit the base `create_*` migration in place and `supabase db reset` the hosted dev DB. Precedent: `77ac448` Squash 12 pre-launch fix-up migrations; `8209c6a` exposed the footgun of incremental `DROP CONSTRAINT; ADD CONSTRAINT` (rebuilding the CHECK silently drops any value added since base).
   - **Post-launch**: add a NEW migration with `ALTER TABLE ... DROP CONSTRAINT ...; ADD CONSTRAINT ... CHECK (...)`. The new CHECK list must be **complete** (re-state every prior value); do not assume the rebuild merges with the old constraint.
2. **TS**: extend the union in `supabase/functions/agent/runs.ts` (`StepType` / `RunStatus`)
3. **Mapping helpers**: if a SQL `case` mapping (e.g. backfill in `_add_agent_runs_error_code.sql`) and a TS helper (e.g. `errorCodeFromStatus`) both produce these values, **they must stay in sync** — each cites the other in a comment

## Supabase / async result destructure

Single call in scope: leave as `{ data, error }`. Two or more: alias both.

### Two rules

1. **Always `Err`, never `Error`** when the abbreviated form is unambiguous.
2. **Error prefix tracks the query's target, not the data alias.**

### Decision matrix

| `data` alias shape | Example | `error` alias |
|---|---|---|
| Entity noun (singular / plural / `Row` / with adjective) | `agent`, `agentRow`, `bots`, `defaultAgent` | `agentErr`, `botErr` — strip the modifier, use the singular entity stem |
| Generic placeholder | `rows`, `created`, `updated` | `insertErr`, `updateErr` — verb of the operation |
| Pure mutation, no return | (no `data:` alias) | `removeErr`, `uploadErr`, `touchErr`, `archiveErr` — verb of the operation |

### Examples

```ts
// ✅ entity noun in data → entity stem in error
const { data: defaultAgent, error: agentErr } = await admin.from('agents')...

// ✅ generic data → operation verb in error
const { data: rows, error: insertErr } = await admin.rpc('insert_bot_if_under_limit', ...)

// ✅ pure mutation
const { error: archiveErr } = await admin.rpc('archive_webhook_event', { msg_id })

// ❌ don't compound modifier+entity
const { data: defaultAgent, error: defaultAgentErr } = ... // no precedent

// ❌ don't spell out Error
const { error: archiveError } = ... // 15:1 minority
```