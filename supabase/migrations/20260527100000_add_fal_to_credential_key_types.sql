-- Adds `fal` to the encrypted_credentials.key_type CHECK constraint
-- so users can BYOK their fal.ai API key (used by the image-gen tool).
-- Tier policy: Free must BYOK, Pro falls back to fermi's platform key
-- (`FAL_API_KEY` env) — same shape as openai / tavily / openrouter.

alter table public.encrypted_credentials
  drop constraint encrypted_credentials_key_type_check;

alter table public.encrypted_credentials
  add constraint encrypted_credentials_key_type_check
  check (key_type in (
    'openrouter',
    'line_channel_access_token',
    'line_channel_secret',
    'anthropic',
    'openai',
    'gemini',
    'tavily',
    'fal'
  ));
