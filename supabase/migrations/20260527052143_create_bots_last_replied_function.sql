-- Most-recent successful reply per bot for the caller's bots, surfaced
-- as `last_replied_at` on the bot list. Derived from `agent_runs`
-- (single source of truth) instead of a denormalized column, and mirrors
-- the existing `bots.first_replied_at`: first vs most-recent reply.
--
-- "Replied" = a run that completed successfully (status 'succeeded'); a
-- bot that has only ever failed returns no row (→ "no replies yet").
-- Ordering by `created_at` rides the existing
-- `agent_runs_bot_id_recent_idx (bot_id, created_at desc)`; for a
-- relative "2d ago" display the few seconds vs `finished_at` are
-- immaterial.

create function public.get_bots_last_replied(p_owner_id uuid)
returns table (bot_id uuid, last_replied_at timestamptz)
  language sql
  stable
  security definer
  set search_path = public
as $$
  select distinct on (r.bot_id) r.bot_id, r.created_at
  from public.agent_runs r
  where r.owner_id = p_owner_id
    and r.status = 'succeeded'
  order by r.bot_id, r.created_at desc;
$$;

revoke execute on function public.get_bots_last_replied(uuid) from public;
grant  execute on function public.get_bots_last_replied(uuid) to service_role;
