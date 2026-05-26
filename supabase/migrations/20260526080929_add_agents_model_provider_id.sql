-- Adds `agents.model_provider_id` so every agent points at one
-- catalog row in `model_providers`. Until now the runtime hardcoded
-- OpenRouter; this column is the pivot point that lets future
-- adapters route per-agent to OpenAI / Anthropic / Gemini direct.
--
-- Done in three steps so the NOT NULL flip never sees an unbackfilled
-- row: add nullable, backfill from the live OpenRouter row, then set
-- NOT NULL. Also patches `handle_new_user` so newly created Default
-- agents land on OpenRouter without the API caller having to know
-- the provider id.

alter table public.agents
  add column model_provider_id uuid references public.model_providers(id);

update public.agents
   set model_provider_id = (select id from public.model_providers where slug = 'openrouter')
 where model_provider_id is null;

alter table public.agents
  alter column model_provider_id set not null;

-- Re-create handle_new_user so the seeded Default agent inherits the
-- OpenRouter provider id. CREATE OR REPLACE keeps the existing
-- trigger binding intact (the trigger references the function by
-- name, not by signature).
create or replace function public.handle_new_user() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  openrouter_id uuid;
begin
  insert into public.users (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  );

  select id into openrouter_id from public.model_providers where slug = 'openrouter';

  insert into public.agents (owner_id, name, is_default, model_provider_id)
  values (new.id, 'Default', true, openrouter_id);

  return new;
end;
$$;
