-- Creates the `encrypted_credentials` table, envelope-encrypted
-- storage for any third-party credential fermi holds on behalf of a
-- user. Decryption happens server-side only; ciphertext is never
-- exposed to clients.
--
-- The identity tuple is `(user_id, key_type, channel_id)`. Channel-
-- agnostic credentials carry a NULL `channel_id`, and a partial unique
-- index enforces one-per-`(user_id, key_type)` for those rows.
--
-- Envelope encryption (AES-GCM-256 throughout):
--   1. Generate random 32-byte DEK (data encryption key) per row.
--   2. Encrypt plaintext credential with DEK → `ciphertext`, `iv`.
--      Refresh token (when present) uses the same DEK with a fresh IV.
--   3. Wrap DEK itself with the KEK (master key from FERMI_KEK env)
--      → `wrapped_dek`, `wrapped_dek_iv`.
--
-- Why envelope: KEK rotation only requires re-wrapping each DEK, not
-- re-encrypting every ciphertext. Also leaves a clean migration path
-- if KEK ever moves to KMS/HSM.

create table public.encrypted_credentials (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  channel_id          uuid references public.channels(id) on delete cascade,
  key_type            text not null check (key_type in (
                        'openrouter',
                        'line_channel_access_token',
                        'line_channel_secret',
                        'anthropic',
                        'openai',
                        'gemini'
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
  unique (user_id, key_type, channel_id),
  check (
    (refresh_ciphertext is null and refresh_iv is null) or
    (refresh_ciphertext is not null and refresh_iv is not null)
  )
);

-- Partial unique index: channel-agnostic creds (channel_id IS NULL) get
-- one-per-(user, key_type) enforcement, since SQL UNIQUE treats NULLs as
-- distinct and would otherwise allow duplicates.
create unique index encrypted_credentials_user_keytype_no_channel_uq
  on public.encrypted_credentials (user_id, key_type)
  where channel_id is null;

create index encrypted_credentials_channel_id_idx on public.encrypted_credentials(channel_id);

create trigger encrypted_credentials_set_updated_at
  before update on public.encrypted_credentials
  for each row execute function public.set_updated_at();

-- No client-facing policies; ciphertext is service_role-only.
alter table public.encrypted_credentials enable row level security;
