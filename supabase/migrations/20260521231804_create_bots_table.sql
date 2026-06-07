-- Creates the `bots` table, the deployment / transport layer.
-- Persona lives on `agents`; the `agent_id` FK is `not null` with
-- `on delete restrict`, every bot has exactly one agent at all
-- times, and an in-use agent can't be deleted (rebind first).
-- One agent : N bots (a single persona can run on multiple LINE OAs).

create table public.bots (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.users(id) on delete cascade,
  agent_id            uuid not null references public.agents(id) on delete restrict,
  platform            text not null default 'line' check (platform in ('line')),
  external_id         text not null,
  handle              text,
  display_name        text,
  avatar_url          text,
  -- Plaintext group-chat activation gate: an end-user types this in a
  -- group to enable the bot there. Not a secret (it's broadcast in
  -- chat) so deliberately not enveloped. null = group chats off.
  group_activation_code text,
  -- Whether the bot transcribes voice messages in activated groups (the
  -- relay feature). @mention replies have no toggle — they're always on,
  -- gated only by a per-(group, member) rate limit.
  group_transcribe_enabled boolean not null default true,
  -- The LINE userId imprinted as this bot's master — the one end-user the
  -- worker grants in-LINE management to (everyone else gets the normal
  -- toolset). Bound once via the imprint flow below; per-bot, since each
  -- LINE OA imprints independently. master ≡ the account owner; this is
  -- only the LINE-side bridge that says "this opaque userId is the owner."
  master_external_id  text,
  -- One-time binding code the owner arms from the dashboard. The worker
  -- imprints the master when an incoming 1:1 text equals a live code, then
  -- clears it. Broadcast into a chat, so not enveloped; single-use + TTL is
  -- the guard. A non-matching message is handled as normal conversation
  -- (silent), so an outsider can't probe whether a bot is awaiting binding.
  imprint_code        text,
  imprint_code_expires_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  disabled_at         timestamptz,
  webhook_verified_at timestamptz,
  deleted_at          timestamptz
);

-- Soft-deleted rows release the (platform, external_id) key so a
-- disconnected bot can be reconnected or claimed by another account.
create unique index bots_active_external_id_uq
  on public.bots (platform, external_id)
  where deleted_at is null;

-- Owner lookups always filter deleted_at, so a partial index over
-- the active subset is both smaller and more selective than a full
-- B-tree on owner_id alone.
create index bots_active_owner_idx
  on public.bots(owner_id)
  where deleted_at is null;

create trigger bots_set_updated_at
  before update on public.bots
  for each row execute function public.set_updated_at();

alter table public.bots enable row level security;

create policy "Users can view their own bots." on public.bots
  for select using (
    (select auth.uid()) = owner_id
    and deleted_at is null
  );

-- Writes flow through service_role-only RPCs. Explicit revoke makes
-- this hold even if RLS were ever disabled on the table.
revoke insert, update, delete on public.bots from authenticated;

-- Locks the owner's users row before counting + inserting so two
-- concurrent connects from the same user can't both observe an
-- under-limit count and bypass the tier quota.
create function public.insert_bot_if_under_limit(
  p_owner_id     uuid,
  p_platform     text,
  p_external_id  text,
  p_display_name text,
  p_agent_id     uuid,
  p_limit        int
) returns table (id uuid, display_name text)
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  current_count int;
begin
  perform 1 from public.users where public.users.id = p_owner_id for update;

  select count(*) into current_count
  from public.bots
  where owner_id = p_owner_id and deleted_at is null;

  if current_count >= p_limit then
    raise exception 'bot_limit_reached' using errcode = 'P0001';
  end if;

  return query
    insert into public.bots (owner_id, platform, external_id, display_name, agent_id)
    values (p_owner_id, p_platform, p_external_id, p_display_name, p_agent_id)
    returning bots.id, bots.display_name;
end;
$$;

revoke execute on function public.insert_bot_if_under_limit(uuid, text, text, text, uuid, int) from public;
grant  execute on function public.insert_bot_if_under_limit(uuid, text, text, text, uuid, int) to service_role;
