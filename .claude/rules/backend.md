---
paths:
  - "server/**/*.ts"
  - "shared/**/*.ts"
  - "supabase/functions/**/*.ts"
  - "supabase/migrations/**/*.sql"
---

# Backend Rules

## Enum / state values: past-verb form

Strings stored in CHECK-constrained `text` columns (DB-side enums) and their TS union counterparts follow `<subject>_<past_verb>` form. Reads as "X happened to Y" — what the row records.

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

1. **DB**: extend `check (... in (...))` in a NEW migration (don't edit historical migrations)
2. **TS**: extend the union in `supabase/functions/agent/runs.ts` (`StepType` / `RunStatus`)
3. **Mapping helpers**: if a SQL `case` mapping (e.g. backfill in `_add_agent_runs_error_code.sql`) and a TS helper (e.g. `errorCodeFromStatus`) both produce these values, **they must stay in sync** — each cites the other in a comment

## Supabase / async result destructure

Two queries in the same scope need disambiguated aliases. One query usually doesn't (`{ data, error }` is fine).

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

### When to alias at all

Skip aliases when only one supabase call lives in the function or block. Once a second call shows up in the same scope, alias **both** for clarity.
