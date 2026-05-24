-- Creates the `agents` table. An agent is the abstract persona / brain
-- a user defines (system prompt, default model, avatar). Many bots can
-- bind to one agent; today the binding is 1:1 (enforced on bots), but
-- the FK on bots is `set null` so agents can be deleted without
-- cascading the deployment.

create table public.agents (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.users(id) on delete cascade,
  name            text not null,
  system_prompt   text,
  default_model   text,
  avatar_url      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index agents_owner_id_idx on public.agents(owner_id);

create trigger agents_set_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();

alter table public.agents enable row level security;

create policy "Users can view their own agents." on public.agents
  for select using ((select auth.uid()) = owner_id);

-- Locks the owner's users row before counting + inserting so two
-- concurrent creates from the same user can't both observe an
-- under-limit count and bypass the tier quota.
create function public.insert_agent_if_under_limit(
  p_owner_id       uuid,
  p_name           text,
  p_system_prompt  text,
  p_default_model  text,
  p_avatar_url     text,
  p_limit          int
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
  where owner_id = p_owner_id;

  if current_count >= p_limit then
    raise exception 'agent_limit_reached' using errcode = 'P0001';
  end if;

  return query
    insert into public.agents (owner_id, name, system_prompt, default_model, avatar_url)
    values (p_owner_id, p_name, p_system_prompt, p_default_model, p_avatar_url)
    returning agents.id;
end;
$$;

revoke execute on function public.insert_agent_if_under_limit(uuid, text, text, text, text, int) from public;
grant execute on function public.insert_agent_if_under_limit(uuid, text, text, text, text, int) to service_role;
