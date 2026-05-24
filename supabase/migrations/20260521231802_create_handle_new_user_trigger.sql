-- Creates the `handle_new_user` trigger that mirrors `auth.users`
-- inserts into `public.users` on signup, pulling `display_name` and
-- `avatar_url` from OAuth provider metadata.
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
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
