-- Recasts `idempotency_keys` from a single namespaced-string PK to
-- a (scope, key) composite PK. The previous design (`"line:01HXY..."`)
-- worked but pushed the partition into a string, losing per-scope
-- analytics, per-scope retention, and per-scope RLS. Composite PK
-- promotes "scope" to a first-class concept.
--
-- 0 rows existed at migration time, so DROP TABLE is destructive but
-- safe. The `purge-idempotency-keys` cron job calls the function by
-- name with no args (defaults bind at call time), so dropping and
-- recreating the function with an added optional `p_scope` filter
-- keeps the cron entry working.

drop table if exists public.idempotency_keys;

create table public.idempotency_keys (
  scope   text not null,
  key     text not null,
  seen_at timestamptz not null default now(),
  primary key (scope, key)
);

alter table public.idempotency_keys enable row level security;

revoke all on public.idempotency_keys from anon, authenticated;

-- p_scope = null  → purge across all scopes (default; matches the
--                   existing cron call with no args)
-- p_scope = 'x'   → purge only that scope, enabling per-scope retention
--                   policies later without another schema migration
drop function if exists public.purge_idempotency_keys(interval);

create function public.purge_idempotency_keys(
  older_than interval default interval '48 hours',
  p_scope    text default null
) returns int
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_count int;
begin
  with deleted as (
    delete from public.idempotency_keys
    where seen_at < now() - older_than
      and (p_scope is null or scope = p_scope)
    returning key
  )
  select count(*) into v_count from deleted;

  return v_count;
end;
$$;

revoke execute on function public.purge_idempotency_keys(interval, text) from public;
grant  execute on function public.purge_idempotency_keys(interval, text) to service_role;
