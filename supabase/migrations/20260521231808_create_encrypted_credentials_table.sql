-- Creates the `encrypted_credentials` table, envelope-encrypted
-- storage for any third-party credential fermi holds on behalf of a
-- user. Ciphertext is service_role-only; never exposed to clients.
--
-- Identity tuple `(user_id, key_type, bot_id)`. Account-level
-- credentials carry NULL `bot_id`; a partial unique index gives them
-- one-per-(user, key_type) enforcement.
--
-- KEK rotation re-wraps each DEK; ciphertext is not touched.

create table public.encrypted_credentials (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  bot_id              uuid references public.bots(id) on delete cascade,
  key_type            text not null check (key_type in (
                        'openrouter',
                        'line_channel_access_token',
                        'line_channel_secret',
                        'anthropic',
                        'openai',
                        'gemini',
                        'tavily'
                      )),
  ciphertext          bytea not null,
  iv                  bytea not null check (octet_length(iv) = 12),
  refresh_ciphertext  bytea,
  refresh_iv          bytea check (refresh_iv is null or octet_length(refresh_iv) = 12),
  wrapped_dek         bytea not null,
  wrapped_dek_iv      bytea not null check (octet_length(wrapped_dek_iv) = 12),
  alg                 text not null default 'aes-gcm-256' check (alg in ('aes-gcm-256')),
  expires_at          timestamptz,
  last_used_at        timestamptz,
  last_refreshed_at   timestamptz,
  metadata            jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, key_type, bot_id),
  check (
    (refresh_ciphertext is null and refresh_iv is null) or
    (refresh_ciphertext is not null and refresh_iv is not null)
  )
);

-- SQL UNIQUE treats NULLs as distinct, so the table-level constraint
-- skips account-level rows (bot_id IS NULL). This partial index
-- re-enforces one-per-(user, key_type) for that subset.
create unique index encrypted_credentials_user_keytype_no_bot_uq
  on public.encrypted_credentials (user_id, key_type)
  where bot_id is null;

create index encrypted_credentials_bot_id_idx on public.encrypted_credentials(bot_id);

create trigger encrypted_credentials_set_updated_at
  before update on public.encrypted_credentials
  for each row execute function public.set_updated_at();

-- Ciphertext is service_role-only. No policies are defined; the
-- explicit revoke makes that intent hold even if RLS were ever
-- disabled on the table.
alter table public.encrypted_credentials enable row level security;
revoke all on public.encrypted_credentials from authenticated, anon;
