-- Creates the `groups` table: one row per LINE group a bot participates
-- in, tracking activation state. Behavior settings (transcription /
-- mention chat toggles) stay per-bot; this table holds only the
-- per-group lifecycle. A `pending` row exists before the owner's
-- activation code is entered — row presence is not "active", `status` is.

create table public.groups (
  id                 uuid primary key default gen_random_uuid(),
  bot_id             uuid not null references public.bots(id) on delete cascade,
  external_group_id  text not null,
  status             text not null default 'pending'
                       check (status in ('pending', 'activated', 'left')),
  activated_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (bot_id, external_group_id)
);

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

alter table public.groups enable row level security;

-- Owner reads their groups through the parent bot. Low-volume table, so
-- the subquery costs nothing versus denormalizing an owner_id snapshot.
create policy "Users can view their own groups." on public.groups
  for select using (
    exists (
      select 1 from public.bots
      where bots.id = groups.bot_id
        and bots.owner_id = (select auth.uid())
        and bots.deleted_at is null
    )
  );

-- Groups are written by the agent worker via service_role only.
revoke insert, update, delete on public.groups from authenticated;
