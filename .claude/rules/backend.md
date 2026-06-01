---
paths:
  - "server/**/*.ts"
  - "shared/**/*.ts"
  - "supabase/functions/**/*.ts"
  - "supabase/migrations/**/*.sql"
---

# Backend Rules

## File / module naming: grammatical number

A module file's name takes the grammatical number of its subject — the thing it is named after, not the things it operates over nor its standing as a module. A countable entity, or a collection of them, is plural; a mass noun, a single concept, or a single action is singular. Countability of that subject is the deciding axis: a file ranging over many items stays singular when its subject is the concept it embodies rather than those items, and "is this a module or a collection" never discriminates, since every file here is a module. The number must agree with the same subject named elsewhere in the codebase and with its database table.

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
3. **Mapping helpers**: if a SQL `case` mapping (e.g. backfill in `_add_agent_runs_error_code.sql`) and a TS helper (e.g. `deriveErrorCode`) both produce these values, **they must stay in sync** — each cites the other in a comment

## Discriminator suffix: `Type`, not `Kind`

A field or union that names "which category is this" takes the `Type` suffix. `Kind` has no precedent — the codebase is uniform on `Type`: `keyType`, `authKeyType`, `KeyType`, `ByokKeyType`, `StepType`, `recordType`. New category field → `<subject>Type`.

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

## Capability vs core function

A **capability** is a tool the LLM chooses to call inside its reasoning loop (`time`, `web-search`, `web-fetch`, `github`, `image-gen`, `twinkle-hub`). Opt-in per agent via `agent_capabilities`; if unattached the agent just can't do that thing and normal conversation is unaffected. Per-agent config for a capability belongs in `agent_capabilities.config`, never as a column on `agents`.

A **core function** is how the agent perceives input and delivers its reply across modalities — its senses and voice: read images (vision), transcribe audio (STT), speak replies (TTS), write text. The worker runs these automatically *around* the loop, driven by the message's media type or the agent's delivery settings; the LLM never invokes them. Their models are hardcoded constants or always-on `agents` columns, never capabilities.

**The test:** does the LLM decide to invoke it mid-conversation (capability), or does the worker do it automatically before/after the loop based on modality (core function)? Output type doesn't decide it — `image-gen` *produces* an image yet is a capability, while TTS *produces* audio yet is a core function — *who triggers it and when* does.

## In-process tool vs MCP capability

A capability wires one of two ways. Discriminator: `CapabilityConfig.url` (`shared/agentCapabilities.ts`) — present → MCP, absent → in-process.

- **In-process tool** (`web-search`, `web-fetch`, `time`, `image-gen`): fermi owns the schema — stable, needs `ToolContext` (admin / KEK / `attachments` sink), often wraps fermi logic (tier policy, SSRF-safe fetch). A static `Tool` in `tools/`; zero handshake, zero extra deploy.
- **MCP capability** (`github`, `twinkle-hub`, BYO URL): a third party owns the schema — large, changing; fermi allowlists a read-only subset and sends a stored token as bearer. Connected via `McpClient`, tools namespaced `slug__name`.

**The test:** is the tool schema fermi's or someone else's? Ours → in-process (a per-connection handshake to reach a schema we already hold and won't change buys nothing). Theirs → MCP (the fixed handshake cost buys not owning or maintaining a schema that changes under us).

## Dashboard try-outs vs production runtime

Two distinct contexts use vendor keys; the source differs.

- **Production runtime** (worker reply, image gen, MCP tool call): user's BYOK first, platform key as fallback. The user opted into BYOK to pay for their own end-user traffic; routing through their key honors that contract.
- **Dashboard try-out** (TTS preview, future image preview / connection test): **platform key only.** The owner is iterating on config inside fermi's UI, not delivering value to an end user. Burning their BYOK quota for "what does cedar sound like" surprises them and erodes the BYOK contract — they signed up to pay for *replies*, not for evaluating voices.

**The test:** is the API call serving an end user (production), or helping the owner make a configuration decision in the dashboard (try-out)? Output destination decides it — going out to LINE / external = production; staying on the dashboard for the owner to evaluate = try-out.

Cost on the try-out side is bounded by per-owner rate limits and is structurally tiny (a TTS preview is ~$0.000025; even 10K previews / month is under $1). Platform absorbs it without unit-economics impact.

Exception: a "test this key" verify call (e.g. BYOK connect flow in `server/utils/byok.ts`) must use the key being tested, not platform — the test's purpose IS to validate the user's credential.