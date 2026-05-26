-- Creates the `capabilities` catalog — MCP servers and skills an
-- agent can be wired up to use. A single `type` discriminator keeps
-- both kinds in one table so the binding layer (`agent_capabilities`)
-- only has one join to manage.
--
-- `owner_id IS NULL` marks builtin (the 5 MCP servers fermi ships
-- with, seeded below); `owner_id IS NOT NULL` is a user's BYO entry.

create table public.capabilities (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references public.users(id) on delete cascade,
  type          text not null check (type in ('mcp', 'skill')),
  slug          text not null,
  display_name  text not null,
  description   text,
  config        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- Postgres UNIQUE treats NULLs as distinct, so a plain
-- `unique (owner_id, type, slug)` would let two builtin rows share
-- the same slug. Split into two partial uniques:
--   builtin (owner_id is null) → (type, slug) globally unique
--   BYO     (owner_id not null) → (owner_id, type, slug) per-owner unique
-- `where deleted_at is null` lets a user soft-delete + re-add a slug
-- without colliding.
create unique index capabilities_builtin_slug_uq
  on public.capabilities (type, slug)
  where owner_id is null and deleted_at is null;

create unique index capabilities_owner_slug_uq
  on public.capabilities (owner_id, type, slug)
  where owner_id is not null and deleted_at is null;

-- Owner lookups always filter deleted_at, so a partial index over
-- the active subset is both smaller and more selective than a full
-- B-tree on owner_id alone.
create index capabilities_active_owner_idx
  on public.capabilities (owner_id)
  where deleted_at is null;

create trigger capabilities_set_updated_at
  before update on public.capabilities
  for each row execute function public.set_updated_at();

alter table public.capabilities enable row level security;

-- Users see all builtin capabilities (owner_id is null) plus their
-- own BYO rows. Soft-deleted rows stay hidden.
create policy "Users can view available capabilities." on public.capabilities
  for select using (
    deleted_at is null
    and (owner_id is null or owner_id = (select auth.uid()))
  );

-- Writes flow through service_role-only RPCs. Explicit revoke makes
-- this hold even if RLS were ever disabled on the table.
revoke insert, update, delete on public.capabilities from authenticated;

-- Seed the builtin MCP servers fermi ships with. `slug` is the key
-- the agent loader uses to find the in-process implementation under
-- `supabase/functions/agent/tools/{slug}.ts`. `description` is what
-- the LLM reads to decide whether to invoke the tool, so keep it
-- focused on "when to use" rather than "what it does".
--
-- Naming convention: nouns, not verbs (a capability is an integration,
-- not an action). Use the provider name when there's one dominant
-- provider with its own OAuth (github, notion, google-calendar — Apple
-- Calendar would be a separate capability with its own OAuth flow).
-- Use the domain name when providers are swappable (web-search can be
-- backed by Tavily / Brave / Bing without changing the surface).
insert into public.capabilities (type, slug, display_name, description) values
  ('mcp', 'time', 'Time',
   'Get the current wall-clock time in any IANA timezone (e.g. "Asia/Taipei", "UTC"). Use whenever the answer depends on the current moment — today''s date, current time, age of a recent event.'),
  ('mcp', 'web-search', 'Web search',
   'Search the web for current information beyond the model''s training cutoff. Returns ranked titles, snippets, and URLs.'),
  ('mcp', 'web-fetch', 'Web fetch',
   'Fetch and return the text contents of a specific URL. Use after web-search returns a promising link, or when the user supplies a URL directly.'),
  ('mcp', 'github', 'GitHub',
   'Browse repositories, issues, pull requests, and source code on the connected GitHub account.'),
  ('mcp', 'google-calendar', 'Google Calendar',
   'Read and create events on the connected Google Calendar.'),
  ('mcp', 'notion', 'Notion',
   'Read and update pages and databases in the connected Notion workspace.');
