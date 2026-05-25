---
paths:
  - "server/**/*.ts"
  - "shared/**/*.ts"
  - "supabase/functions/**/*.ts"
  - "app/**/*.vue"
  - "app/**/*.ts"
---

# Naming Rules

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
