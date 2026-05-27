-- Creates the `model_providers` catalog, where every agent message
-- gets routed for a response. Sibling of `capabilities` (tools), but
-- with different cardinality: every agent picks exactly one model
-- provider, vs N optional capabilities. Kept in its own table so the
-- agents FK reads cleanly and the catalog is platform-curated (no
-- BYO row equivalent).
--
-- Adding a provider: insert a row here, add its `credential_key_type`
-- to the `encrypted_credentials.key_type` CHECK list (already covers
-- the four we seed), and ship the matching connect endpoint.

create table public.model_providers (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null,
  display_name          text not null,
  -- Drives which connect-endpoint pattern the UI + API render:
  --   oauth   → /api/oauth/<slug>/{start,callback}      (OpenRouter today)
  --   api_key → /api/connections/<slug> POST {apiKey}   (Tavily-style for OpenAI/Anthropic/Gemini)
  connect_type          text not null check (connect_type in ('oauth', 'api_key')),
  -- Shape of the model string stored in `agents.default_text_model`.
  -- aggregator (OpenRouter): provider-qualified slug like "anthropic/claude-3.5-sonnet".
  -- direct (OpenAI/Anthropic/Gemini): vendor-native model id like "gpt-4o".
  -- The runtime adapter reads this to know how to interpret the model field.
  routing_type          text not null check (routing_type in ('aggregator', 'direct')),
  -- Maps to `encrypted_credentials.key_type` so the runtime can find
  -- the user's stored key without hardcoding slug→key_type strings.
  credential_key_type   text not null,
  status                text not null default 'live' check (status in ('live', 'coming_soon')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (slug)
);

create trigger model_providers_set_updated_at
  before update on public.model_providers
  for each row execute function public.set_updated_at();

alter table public.model_providers enable row level security;

-- Catalog is non-sensitive; any authenticated user can read it to
-- render the connections list and the per-agent provider picker.
create policy "Users can view model providers." on public.model_providers
  for select using (true);

-- Writes flow through service_role-only migrations (seeding) and any
-- future admin RPCs. Explicit revoke makes this hold even if RLS were
-- ever disabled on the table.
revoke insert, update, delete on public.model_providers from authenticated;

-- Seed the live catalog. OpenRouter is the only one with a working
-- connect flow today (OAuth via /api/oauth/openrouter). The other
-- three are seeded as coming_soon so the future connections-list UI
-- can render them as a teaser without offering a dead-end connect
-- button; flip to 'live' in the same migration that ships each one's
-- /api/connections/<slug> endpoint.
insert into public.model_providers (slug, display_name, connect_type, routing_type, credential_key_type, status) values
  ('openrouter', 'OpenRouter', 'oauth',   'aggregator', 'openrouter', 'live'),
  ('openai',     'OpenAI',     'api_key', 'direct',     'openai',     'coming_soon'),
  ('anthropic',  'Anthropic',  'api_key', 'direct',     'anthropic',  'coming_soon'),
  ('gemini',     'Google AI',  'api_key', 'direct',     'gemini',     'coming_soon');
