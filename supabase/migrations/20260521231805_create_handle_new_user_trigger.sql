-- Creates the `handle_new_user` trigger that mirrors `auth.users`
-- inserts into `public.users` on signup, pulling `display_name` and
-- `avatar_url` from OAuth provider metadata. Also seeds the user's
-- Default agent so the "every user has one default agent" invariant
-- holds from signup onward.
--
-- The function runs as `SECURITY DEFINER` with a locked `search_path`
-- so it can write to `public.users` from the auth schema context
-- without granting write privileges to `supabase_auth_admin`.

create function public.handle_new_user() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
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

  insert into public.agents (owner_id, name, is_default)
  values (new.id, 'Default', true);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
