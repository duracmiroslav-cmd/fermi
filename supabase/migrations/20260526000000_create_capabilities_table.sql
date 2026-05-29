-- Creates the `capabilities` catalog, tools an agent can be wired
-- up to use. Each row is identified by `slug` (the key the agent
-- runtime uses to find its in-process implementation under
-- `supabase/functions/agent/tools/{slug}.ts`).
--
-- `owner_id IS NULL` marks builtin (fermi-shipped, seeded below);
-- `owner_id IS NOT NULL` is a user's BYO entry (e.g. a self-hosted
-- MCP server URL).

create table public.capabilities (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references public.users(id) on delete cascade,
  slug          text not null,
  display_name  text not null,
  description   text,
  config        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- Postgres UNIQUE treats NULLs as distinct, so a plain
-- `unique (owner_id, slug)` would let two builtin rows share
-- the same slug. Split into two partial uniques:
--   builtin (owner_id is null) → slug globally unique
--   BYO     (owner_id not null) → (owner_id, slug) per-owner unique
-- `where deleted_at is null` lets a user soft-delete + re-add a slug
-- without colliding.
create unique index capabilities_builtin_slug_uq
  on public.capabilities (slug)
  where owner_id is null and deleted_at is null;

create unique index capabilities_owner_slug_uq
  on public.capabilities (owner_id, slug)
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

-- Seed the builtin tools fermi ships with. `description` is what the
-- LLM reads to decide whether to invoke the tool, so keep it focused
-- on "when to use" rather than "what it does".
--
-- Naming convention: nouns, not verbs (a capability is an integration,
-- not an action). Use the provider name when there's one dominant
-- provider with its own OAuth (github, notion, google-calendar).
-- Apple Calendar would be a separate capability with its own OAuth flow.
-- Use the domain name when providers are swappable (web-search can be
-- backed by Tavily / Brave / Bing without changing the surface).
insert into public.capabilities (slug, display_name, description) values
  ('time', 'Time',
   'Get the current wall-clock time in any IANA timezone (e.g. "Asia/Taipei", "UTC"). Use whenever the answer depends on the current moment, today''s date, current time, age of a recent event.'),
  ('web-search', 'Web search',
   'Search the web for current information beyond the model''s training cutoff. Returns ranked titles, snippets, and URLs.'),
  ('web-fetch', 'Web fetch',
   'Fetch and return the text contents of a specific URL. Use after web-search returns a promising link, or when the user supplies a URL directly.'),
  ('image-gen', 'Image generation',
   'Generate an image from a natural-language prompt. Use when the user explicitly asks to "draw", "generate an image", "make a picture", or similar; do NOT use to fetch existing images from the web.'),
  ('github', 'GitHub',
   'Browse repositories, issues, pull requests, and source code on the connected GitHub account.'),
  ('google-calendar', 'Google Calendar',
   'Read and create events on the connected Google Calendar.'),
  ('notion', 'Notion',
   'Read and update pages and databases in the connected Notion workspace.');

-- MCP wiring for the github capability: a capability whose `config.url`
-- is set is treated as MCP by the agent runtime, which connects to that
-- remote server, sends the owner's `authKeyType` credential as a bearer
-- token, and surfaces only the tools in `tools`.
--
-- GitHub's MCP server exposes ~42 tools including destructive writes
-- (create_or_update_file, delete_file, create_pull_request, ...). The
-- allowlist deliberately keeps only read-only tools: the agent is driven
-- by untrusted LINE / web content, so it must never hold a write
-- capability it could be prompt-injected into using. (A fine-grained
-- PAT's read-only scope does NOT filter the server's tool list, so this
-- allowlist is the enforcement point, not the token.)
update public.capabilities
set config = jsonb_build_object(
  'url', 'https://api.githubcopilot.com/mcp/',
  'authKeyType', 'github',
  'tools', jsonb_build_array(
    'get_commit',
    'get_file_contents',
    'get_label',
    'get_latest_release',
    'get_me',
    'get_release_by_tag',
    'get_tag',
    'get_team_members',
    'get_teams',
    'issue_read',
    'list_branches',
    'list_commits',
    'list_issue_types',
    'list_issues',
    'list_pull_requests',
    'list_releases',
    'list_repository_collaborators',
    'list_tags',
    'pull_request_read',
    'search_code',
    'search_issues',
    'search_pull_requests',
    'search_repositories',
    'search_users'
  )
)
where slug = 'github' and owner_id is null;
