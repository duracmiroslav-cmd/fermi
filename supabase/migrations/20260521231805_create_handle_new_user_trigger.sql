-- Creates the `handle_new_user` trigger that mirrors `auth.users`
-- inserts into `public.users` on signup, pulling `display_name` and
-- `avatar_url` from OAuth provider metadata. Also seeds the user's
-- Default agent (bound to OpenRouter) so the "every user has one
-- default agent" invariant holds from signup onward. The agent is
-- seeded in maintenance mode so a new user's very first chat with it
-- can surface the onboarding tools (connect a bot / OpenRouter).
--
-- The function runs as `SECURITY DEFINER` with a locked `search_path`
-- so it can write to `public.users` from the auth schema context
-- without granting write privileges to `supabase_auth_admin`.

create function public.handle_new_user() returns trigger
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

  -- Maintenance window mirrors MODE_DURATIONS.maintenance in
  -- supabase/functions/agent/tools/management/mode.ts (30 min); the agent
  -- auto-reverts to 'normal' after it via effectiveAgentMode. Keep the two
  -- in step.
  insert into public.agents (owner_id, name, is_default, model_provider_id, mode, mode_until)
  values (new.id, 'Default', true, openrouter_id, 'maintenance', now() + interval '30 minutes');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
