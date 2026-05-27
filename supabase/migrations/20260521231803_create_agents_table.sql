-- Creates the `agents` table, the persona layer (system prompt,
-- default model, avatar). Bots reference an agent via
-- `bots.agent_id` (NOT NULL, ON DELETE RESTRICT, see `bots`).

create table public.agents (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.users(id) on delete cascade,
  name                  text not null,
  system_prompt         text,
  default_text_model    text,
  avatar_url            text,
  is_default            boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

-- Owner lookups always filter deleted_at, so a partial index over
-- the active subset is both smaller and more selective than a full
-- B-tree on owner_id alone.
create index agents_active_owner_idx
  on public.agents(owner_id)
  where deleted_at is null;

-- "Every user has exactly one Default agent" invariant. Partial
-- unique over the live subset so soft-deleting a Default + creating
-- a new one doesn't trip the constraint. The Default is seeded by
-- `handle_new_user` at signup and protected from delete by
-- `delete_agent`.
create unique index agents_one_default_per_owner_idx
  on public.agents(owner_id)
  where is_default and deleted_at is null;

create trigger agents_set_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();

alter table public.agents enable row level security;

create policy "Users can view their own agents." on public.agents
  for select using (
    (select auth.uid()) = owner_id
    and deleted_at is null
  );

-- Writes flow through service_role-only RPCs. Explicit revoke makes
-- this hold even if RLS were ever disabled on the table.
revoke insert, update, delete on public.agents from authenticated;

-- Locks the owner's users row before counting + inserting so two
-- concurrent creates from the same user can't both observe an
-- under-limit count and bypass the tier quota.
create function public.insert_agent_if_under_limit(
  p_owner_id            uuid,
  p_name                text,
  p_system_prompt       text,
  p_default_text_model  text,
  p_avatar_url          text,
  p_limit               int
) returns table (id uuid)
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  current_count int;
begin
  perform 1 from public.users where public.users.id = p_owner_id for update;

  select count(*) into current_count
  from public.agents
  where owner_id = p_owner_id and deleted_at is null;

  if current_count >= p_limit then
    raise exception 'agent_limit_reached' using errcode = 'P0001';
  end if;

  return query
    insert into public.agents (owner_id, name, system_prompt, default_text_model, avatar_url)
    values (p_owner_id, p_name, p_system_prompt, p_default_text_model, p_avatar_url)
    returning agents.id;
end;
$$;

revoke execute on function public.insert_agent_if_under_limit(uuid, text, text, text, text, int) from public;
grant execute on function public.insert_agent_if_under_limit(uuid, text, text, text, text, int) to service_role;
