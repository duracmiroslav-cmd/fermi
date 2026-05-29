-- First and most-recent successful reply per bot for the caller's bots.
-- Surfaced as `first_replied_at` on the bot detail (drives the "Setup
-- complete" celebration) and `last_replied_at` on the bot list.
-- Both derive from `agent_runs` (single source of truth) instead of a
-- denormalized column on `bots`, so:
--   * Backfill is free: any pre-existing succeeded run counts immediately.
--   * The agent worker never writes a "first reply" marker mid-push.
--   * The definition of "replied" lives in one place.
--
-- "Replied" = a run that completed successfully (status 'succeeded'); a
-- bot that has only ever failed returns no row (→ "no replies yet").
-- Ordering by `created_at` rides the existing
-- `agent_runs_bot_id_recent_idx (bot_id, created_at desc)`; the ASC
-- variant for `first_replied` reverse-scans the same index. For a
-- relative "2d ago" display the few seconds vs `finished_at` are
-- immaterial.

create function public.get_bots_first_replied(p_owner_id uuid)
returns table (bot_id uuid, first_replied_at timestamptz)
  language sql
  stable
  security definer
  set search_path = public
as $$
  select distinct on (r.bot_id) r.bot_id, r.created_at
  from public.agent_runs r
  where r.owner_id = p_owner_id
    and r.status = 'succeeded'
  order by r.bot_id, r.created_at asc;
$$;

revoke execute on function public.get_bots_first_replied(uuid) from public;
grant  execute on function public.get_bots_first_replied(uuid) to service_role;

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
