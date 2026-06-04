-- Creates the `users` table, fermi's account profile that extends
-- `auth.users` one-to-one by sharing its primary key.

create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  display_name  text,
  avatar_url    text,
  -- Null until first login detects the browser's values (confirm.vue);
  -- the worker falls back to zh-Hant / Asia/Taipei. A NOT NULL default
  -- would mask "never set" from "deliberately picked the default".
  locale        text,
  timezone      text,
  tier          text not null default 'free' check (tier in ('free', 'pro')),
  is_admin      boolean not null default false,
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

alter table public.users enable row level security;

create policy "Users can view their own profile." on public.users
  for select using ((select auth.uid()) = id);

create policy "Users can update their own profile." on public.users
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Self-promotion guard: RLS picks the row, column grants pick the columns.
revoke update on public.users from authenticated;
grant update (display_name, locale, timezone, avatar_url)
  on public.users to authenticated;
