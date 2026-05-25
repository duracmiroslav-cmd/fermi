-- Adds denormalized snapshot columns to `agent_runs` so dashboard
-- queries can filter by bot / agent / owner without joining through
-- `threads` and `bots` on every read. `agent_id` is a snapshot, not
-- a live reference: if a bot's agent later changes, historical runs
-- stay attributed to the agent that actually handled them.
--
-- A BEFORE INSERT trigger fills the three columns from the run's
-- thread, so the existing `startRun(threadId)` API doesn't change.

alter table public.agent_runs
  add column bot_id   uuid,
  add column agent_id uuid,
  add column owner_id uuid;

-- Backfill the handful of existing rows from the current thread → bot
-- chain. Brand-new dev data; the agent_id "snapshot" for these is
-- approximate (it's whatever the bot's agent is right now), which is
-- fine for pre-launch.
update public.agent_runs r
   set bot_id   = b.id,
       agent_id = b.agent_id,
       owner_id = b.owner_id
  from public.threads t
       join public.bots b on b.id = t.bot_id
 where t.id = r.thread_id;

alter table public.agent_runs
  alter column bot_id   set not null,
  alter column agent_id set not null,
  alter column owner_id set not null;

alter table public.agent_runs
  add constraint agent_runs_bot_id_fkey
    foreign key (bot_id)   references public.bots(id)   on delete cascade,
  add constraint agent_runs_agent_id_fkey
    foreign key (agent_id) references public.agents(id) on delete cascade,
  add constraint agent_runs_owner_id_fkey
    foreign key (owner_id) references public.users(id)  on delete cascade;

-- Per-bot and per-owner dashboard cards: "most recent runs for X".
create index agent_runs_bot_id_recent_idx
  on public.agent_runs(bot_id, created_at desc);

create index agent_runs_owner_id_recent_idx
  on public.agent_runs(owner_id, created_at desc);

-- BEFORE INSERT trigger fills the snapshot from the run's thread, so
-- `startRun` keeps its single-arg `thread_id` API. Triggers fire on
-- service_role inserts too (RLS is bypassed, triggers are not),
-- which is exactly what we want.
create function public.fill_agent_run_snapshot() returns trigger
  language plpgsql
as $$
begin
  if new.bot_id is null or new.agent_id is null or new.owner_id is null then
    select b.id, b.agent_id, b.owner_id
      into new.bot_id, new.agent_id, new.owner_id
    from public.threads t
    join public.bots b on b.id = t.bot_id
    where t.id = new.thread_id;
  end if;
  return new;
end;
$$;

create trigger agent_runs_fill_snapshot
  before insert on public.agent_runs
  for each row execute function public.fill_agent_run_snapshot();
