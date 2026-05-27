-- Postgres impl of the rate-limit counter. Selected by the counter
-- factory when UPSTASH_REDIS_REST_URL is unset; self-host friendly.
-- Each row is one fixed-window bucket; key encodes (bot, external
-- user, window scope, time bucket) — see `shared/constants/limits.ts`
-- rateLimitKey for the format.
--
-- A purge cron sweeps expired buckets daily so the table stays small.
-- Hot keys keep getting bumped, so the cron only deletes cold ones.

create table public.rate_limit_buckets (
  key         text        primary key,
  count       int         not null default 0,
  expires_at  timestamptz not null
);

-- Drives the purge cron's WHERE expires_at < now() scan.
create index rate_limit_buckets_expires_at_idx
  on public.rate_limit_buckets(expires_at);

create function public.incr_rate_limit_bucket(
  bucket_key  text,
  ttl_sec     int
) returns int
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limit_buckets(key, count, expires_at)
  values (bucket_key, 1, now() + make_interval(secs => ttl_sec))
  on conflict (key) do update
    set count = rate_limit_buckets.count + 1
  returning count into v_count;
  return v_count;
end;
$$;

revoke execute on function public.incr_rate_limit_bucket(text, int) from public;
grant  execute on function public.incr_rate_limit_bucket(text, int) to service_role;

create function public.purge_expired_rate_limit_buckets() returns int
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_count int;
begin
  with deleted as (
    delete from public.rate_limit_buckets
    where expires_at < now()
    returning key
  )
  select count(*) into v_count from deleted;
  return v_count;
end;
$$;

revoke execute on function public.purge_expired_rate_limit_buckets() from public;
grant  execute on function public.purge_expired_rate_limit_buckets() to service_role;

select cron.schedule(
  'purge-expired-rate-limit-buckets',
  '0 4 * * *',
  $$ select public.purge_expired_rate_limit_buckets(); $$
);

alter table public.rate_limit_buckets enable row level security;
-- Worker (service_role) only. No user-facing reads; rate limits are
-- an internal abuse-defense concern and don't surface in any UI.
revoke all on public.rate_limit_buckets from authenticated;
