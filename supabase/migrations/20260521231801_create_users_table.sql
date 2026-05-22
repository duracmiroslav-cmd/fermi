-- Creates the `users` table, fermi's account profile that extends
-- `auth.users` one-to-one by sharing its primary key.

create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  display_name  text,
  avatar_url    text,
  locale        text not null default 'zh-Hant',
  timezone      text not null default 'Asia/Taipei',
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
  for select using (auth.uid() = id);

create policy "Users can update their own profile." on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);
