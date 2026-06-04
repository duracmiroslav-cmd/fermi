-- Creates the `reminders` table + its fire machinery: a one-shot
-- scheduled push the agent sets up on the user's behalf (the LLM calls
-- the `create_reminder` in-process tool). Recurring reminders are
-- intentionally out of scope (see roadmap "Recurring reminder" cut).
--
-- Lifecycle: pending → fired | failed | cancelled.
--   pending   waiting for fire_at
--   fired     the worker claimed it (CAS, see below) and pushed
--   failed    permanent delivery failure (bot/token gone, LINE 4xx)
--   cancelled user cancelled it via the LLM before it fired
--
-- Idempotent delivery: the worker claims a fire with
--   update reminders set status='fired' where id=$1 and status='pending'
-- and only the update that touches 1 row earns the right to push. Any
-- duplicate (pgmq redelivery, a cron double-enqueue) finds the row
-- already `fired` and no-ops. So no `firing` in-progress state is
-- needed; the status flip itself is the lock.

create table public.reminders (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.users(id) on delete cascade,
  bot_id            uuid not null references public.bots(id) on delete cascade,
  thread_id         uuid not null references public.threads(id) on delete cascade,
  -- The end-user the reminder fires to. Denormalized from the thread so
  -- the per-(owner, end-user) slot cap can be counted without a join,
  -- and so a future thread reshuffle can't redirect a pending fire.
  external_user_id  text not null,
  fire_at           timestamptz not null,
  message           text not null,
  status            text not null default 'pending'
                      check (status in ('pending', 'fired', 'cancelled', 'failed')),
  fired_at          timestamptz,
  failure_reason    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- The fire cron scans `status='pending' and fire_at <= now()` once a
-- minute; a partial index over just the pending subset keeps that scan
-- cheap as fired/cancelled rows accumulate.
create index reminders_pending_fire_at_idx
  on public.reminders (fire_at)
  where status = 'pending';

-- `list_reminders` filters by (owner_id, external_user_id) over the
-- pending subset; so does the cancel update's WHERE.
create index reminders_owner_user_pending_idx
  on public.reminders (owner_id, external_user_id)
  where status = 'pending';

create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

alter table public.reminders enable row level security;

-- Owners can read their own reminders (a future dashboard manager UI).
-- All writes flow through service_role (the worker + LLM tools); the
-- explicit revoke holds even if RLS were ever disabled.
create policy "Users can view their own reminders." on public.reminders
  for select using ((select auth.uid()) = owner_id);

revoke insert, update, delete on public.reminders from authenticated;

-- Reminders are created by the agent worker (service_role) via a plain
-- insert from the create_reminder tool — no count-and-check RPC, because
-- there's no per-tier cap on how many a user can hold. The real cost
-- axes are bounded elsewhere: creation velocity by the per-(bot,user)
-- rate limiter, delivery by the owner's monthly `line_push` quota.

-- ---- Fire queue --------------------------------------------------------------
-- A pgmq queue distinct from `webhook_events`: a reminder fire is not a
-- webhook (no LINE event, no dedup-by-webhookEventId), and keeping it
-- separate leaves the working webhook drain path untouched. Mirrors the
-- worker_helpers wrappers so the worker never touches the pgmq schema.

do $$ begin
  perform pgmq.drop_queue('reminder_events');
exception when others then null;
end $$;

select pgmq.create('reminder_events');

create function public.dequeue_reminder_events(
  batch_size integer default 10,
  visibility_timeout integer default 60
)
returns table (msg_id bigint, payload jsonb)
  language sql
  security definer
  set search_path = public
as $$
  select msg_id, message as payload
  from pgmq.read('reminder_events', visibility_timeout, batch_size);
$$;

revoke execute on function public.dequeue_reminder_events(integer, integer) from public;
grant  execute on function public.dequeue_reminder_events(integer, integer) to service_role;

create function public.archive_reminder_event(msg_id bigint) returns boolean
  language sql
  security definer
  set search_path = public
as $$
  select pgmq.archive('reminder_events', msg_id);
$$;

revoke execute on function public.archive_reminder_event(bigint) from public;
grant  execute on function public.archive_reminder_event(bigint) to service_role;

-- Pure producer: enqueues every due pending reminder and returns the
-- count. Never mutates status — the worker's CAS claim is the single
-- source of truth for "did this fire", so a reminder enqueued twice
-- (two cron ticks before the worker drains) still pushes at most once.
-- LIMIT caps a single tick's batch so a backlog can't enqueue unbounded
-- work; the next tick picks up the remainder.
create function public.enqueue_due_reminders() returns int
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  enqueued int;
begin
  with due as (
    select id
    from public.reminders
    where status = 'pending'
      and fire_at <= now()
    order by fire_at
    limit 500
  ), sent as (
    select pgmq.send('reminder_events', jsonb_build_object('reminder_id', due.id)) from due
  )
  select count(*) into enqueued from sent;
  return enqueued;
end;
$$;

revoke execute on function public.enqueue_due_reminders() from public;
grant  execute on function public.enqueue_due_reminders() to service_role;

-- Once a minute: enqueue due reminders, then ping the worker so the
-- fire lands within ~1 min of fire_at rather than waiting on the next
-- drain tick. Same Vault service-role pattern as drain-webhook-events.
-- pg_cron is minute-granular on managed Supabase, which bounds the
-- worst-case latency at ~1 min (acceptable per the /remind lock-in).
select cron.schedule(
  'fire-due-reminders',
  '* * * * *',
  $$
  select public.enqueue_due_reminders();
  select net.http_post(
    url := 'https://uysppyveyizzzkatafqq.supabase.co/functions/v1/agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'service_role_key'
      )
    )
  );
  $$
);
