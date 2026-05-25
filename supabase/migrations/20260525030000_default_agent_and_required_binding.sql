-- Establishes the "every user has one default agent" invariant and
-- makes `bots.agent_id` mandatory. The structural shifts here:
--
--   1. `agents.is_default` flag + partial unique idx — one default
--      per owner. Set by the signup trigger; protected from delete by
--      the updated `delete_agent` RPC.
--
--   2. `bots.agent_id` drops its `unique` constraint (1 agent : 1 bot
--      → 1 agent : N bots — one persona can run on multiple LINE Official Accounts)
--      and switches from `on delete set null` to `not null` + `on
--      delete restrict`. Pause is now solely the `disabled_at` switch;
--      "bot with no agent" is no longer a representable state.
--
--   3. `handle_new_user` extended to seed each new user's Default
--      agent inside the same trigger.
--
--   4. `delete_agent` blocks two cases: target is default (always
--      undeletable), or target still has live bots bound (caller must
--      rebind first, since the FK is now restrict).
--
--   5. `insert_bot_if_under_limit` gains a required `p_agent_id`
--      parameter so the bot is created with its persona attached in
--      the same statement.

-- 1) is_default flag + one-per-owner uniqueness over the live subset
alter table public.agents
  add column is_default boolean not null default false;

create unique index agents_one_default_per_owner_idx
  on public.agents(owner_id)
  where is_default and deleted_at is null;

-- 2) Backfill: every existing user gets a Default agent if they
--    don't already have one. Safe for fresh DBs (no rows) and for
--    DBs with prior users alike.
insert into public.agents (owner_id, name, is_default)
select u.id, 'Default', true
from public.users u
where not exists (
  select 1 from public.agents a
  where a.owner_id = u.id
    and a.is_default
    and a.deleted_at is null
);

-- 3) Backfill orphan bots to point at their owner's Default agent
update public.bots b
set agent_id = (
  select id from public.agents
  where owner_id = b.owner_id
    and is_default
    and deleted_at is null
  limit 1
)
where b.agent_id is null
  and b.deleted_at is null;

-- 4) Drop the 1:1 unique then make NOT NULL + restrict FK.
alter table public.bots
  drop constraint bots_agent_id_key;

alter table public.bots
  drop constraint bots_agent_id_fkey;

alter table public.bots
  alter column agent_id set not null;

alter table public.bots
  add constraint bots_agent_id_fkey
  foreign key (agent_id) references public.agents(id) on delete restrict;

-- 5) Extend handle_new_user to also seed the user's Default agent
create or replace function public.handle_new_user() returns trigger
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

-- 6) delete_agent: block default + block in-use; on-delete-set-null
--    of the bot binding is no longer valid (column is NOT NULL).
create or replace function public.delete_agent(
  p_agent_id uuid,
  p_owner_id uuid
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_id uuid;
  v_is_default boolean;
  v_bot_count int;
begin
  select is_default into v_is_default
  from public.agents
  where id = p_agent_id
    and owner_id = p_owner_id
    and deleted_at is null;

  if v_is_default is null then
    raise exception 'agent_not_found' using errcode = 'P0002';
  end if;

  if v_is_default then
    raise exception 'cannot_delete_default_agent' using errcode = 'P0001';
  end if;

  select count(*) into v_bot_count
  from public.bots
  where agent_id = p_agent_id and deleted_at is null;

  if v_bot_count > 0 then
    raise exception 'agent_in_use' using errcode = 'P0001';
  end if;

  update public.agents
    set deleted_at = now()
  where id = p_agent_id
    and owner_id = p_owner_id
    and deleted_at is null
  returning id into v_id;

  return v_id;
end;
$$;

-- 7) insert_bot_if_under_limit gains p_agent_id. Old signature must
--    be dropped explicitly (return type unchanged but param list
--    changed). Caller (server/utils/bots/line.ts) resolves the
--    Default agent before invoking.
drop function if exists public.insert_bot_if_under_limit(uuid, text, text, text, int);

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
