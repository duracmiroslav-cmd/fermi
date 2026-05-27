-- Extends `insert_agent_if_under_limit` with `p_model_provider_id` so
-- the API layer can pass the user's chosen provider through to the
-- INSERT. Functions in Postgres are keyed by (name, arg types) so a
-- new arg = a new signature; drop the old one explicitly to avoid
-- leaving two functions named the same.

drop function if exists public.insert_agent_if_under_limit(uuid, text, text, text, text, int);

create function public.insert_agent_if_under_limit(
  p_owner_id            uuid,
  p_name                text,
  p_system_prompt       text,
  p_default_text_model  text,
  p_default_vision_model text,
  p_model_provider_id   uuid,
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
    insert into public.agents (owner_id, name, system_prompt, default_text_model, default_vision_model, model_provider_id, avatar_url)
    values (p_owner_id, p_name, p_system_prompt, p_default_text_model, p_default_vision_model, p_model_provider_id, p_avatar_url)
    returning agents.id;
end;
$$;

revoke execute on function public.insert_agent_if_under_limit(uuid, text, text, text, text, uuid, text, int) from public;
grant execute on function public.insert_agent_if_under_limit(uuid, text, text, text, text, uuid, text, int) to service_role;
