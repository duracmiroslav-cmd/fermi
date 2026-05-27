-- Postgres impl of the monthly-quota counter. Selected by the counter
-- factory when UPSTASH_REDIS_REST_URL is unset. Each row is one
-- (owner, purpose, month) bucket. Key shape:
--   quota:<owner_id>:<purpose>:<YYYY-MM>
-- See `shared/constants/limits.ts` usageQuotaKey for the format.
--
-- Old monthly rows are intentionally kept (no purge cron): they're
-- small, useful for "what was X's usage last month" audit, and once
-- the new month rolls in they simply stop being read.

create table public.usage_counters (
  key         text        primary key,
  count       bigint      not null default 0,
  updated_at  timestamptz not null default now()
);

create trigger usage_counters_set_updated_at
  before update on public.usage_counters
  for each row execute function public.set_updated_at();

create function public.consume_usage_quota(
  quota_key text
) returns bigint
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_count bigint;
begin
  insert into public.usage_counters(key, count)
  values (quota_key, 1)
  on conflict (key) do update
    set count = usage_counters.count + 1
  returning count into v_count;
  return v_count;
end;
$$;

revoke execute on function public.consume_usage_quota(text) from public;
grant  execute on function public.consume_usage_quota(text) to service_role;

alter table public.usage_counters enable row level security;
-- Worker / server (service_role) only. Dashboard /usage reads go
-- through `/api/me/usage` which scopes by current user via auth.uid().
revoke all on public.usage_counters from authenticated;
