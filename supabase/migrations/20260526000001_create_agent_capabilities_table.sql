-- Binds an agent to the capabilities it can use at runtime. An
-- agent's active tool set is exactly the rows here where
-- `disabled_at is null`.
--
-- `disabled_at` (null = enabled) follows the same lifecycle-column
-- pattern as `bots.disabled_at` — a boolean would collapse "when
-- did the user turn this off" into nothing.
--
-- `config` holds per-agent overrides on top of the capability's
-- own defaults (e.g. a tool allowlist restricting which functions
-- of a multi-tool MCP server this agent can call).
--
-- No soft-delete: this is a configuration row, not an entity worth
-- preserving. `disabled_at` covers "temporarily off"; detach is a
-- real delete.

create table public.agent_capabilities (
  agent_id       uuid not null references public.agents(id)       on delete cascade,
  capability_id  uuid not null references public.capabilities(id) on delete cascade,
  disabled_at    timestamptz,
  config         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (agent_id, capability_id)
);

-- Agent loader fetches the active subset on every run start; the
-- partial index sizes itself to that working set.
create index agent_capabilities_active_agent_idx
  on public.agent_capabilities (agent_id)
  where disabled_at is null;

create trigger agent_capabilities_set_updated_at
  before update on public.agent_capabilities
  for each row execute function public.set_updated_at();

alter table public.agent_capabilities enable row level security;

-- Users see bindings against their own live agents. The capability
-- row's own visibility is independently enforced by the capabilities
-- table's select policy.
create policy "Users can view their agent capability bindings." on public.agent_capabilities
  for select using (
    exists (
      select 1 from public.agents a
      where a.id = agent_capabilities.agent_id
        and a.owner_id = (select auth.uid())
        and a.deleted_at is null
    )
  );

-- Writes flow through service_role-only RPCs. Explicit revoke makes
-- this hold even if RLS were ever disabled on the table.
revoke insert, update, delete on public.agent_capabilities from authenticated;
