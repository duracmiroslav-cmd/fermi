-- Creates the `encrypted_keys` table, envelope-encrypted storage for
-- any third-party credential fermi holds on behalf of a user.
-- Decryption happens server-side only; ciphertext is never exposed to
-- clients.
--
-- The identity tuple is `(user_id, key_type, channel_id)`. Channel-
-- agnostic credentials carry a NULL `channel_id`, and a partial unique
-- index enforces one-per-`(user_id, key_type)` for those rows.
--
-- AES-GCM-256 is chosen as the AEAD primitive (confidentiality and
-- integrity in one). `iv` is the 12-byte nonce and must be unique per
-- encryption. The `alg` column allows future rotation without renaming
-- columns.

create table public.encrypted_keys (
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
  iv                  bytea not null,
  refresh_ciphertext  bytea,
  refresh_iv          bytea,
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
create unique index encrypted_keys_user_keytype_no_channel_uq
  on public.encrypted_keys (user_id, key_type)
  where channel_id is null;

create index encrypted_keys_channel_id_idx on public.encrypted_keys(channel_id);

create trigger encrypted_keys_set_updated_at
  before update on public.encrypted_keys
  for each row execute function public.set_updated_at();

-- No client-facing policies; ciphertext is service_role-only.
alter table public.encrypted_keys enable row level security;
