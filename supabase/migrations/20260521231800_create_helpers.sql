-- Creates the `pgcrypto` extension (for `gen_random_uuid()`) and the
-- `set_updated_at()` trigger helper used by every table that
-- maintains an `updated_at` column.

create extension if not exists "pgcrypto";

create function public.set_updated_at() returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
