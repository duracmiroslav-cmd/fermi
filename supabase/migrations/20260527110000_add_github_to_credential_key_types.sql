-- Adds `github` to the encrypted_credentials.key_type CHECK so users can
-- BYOK a GitHub PAT, used to authenticate to GitHub's remote MCP server.
--
-- GitHub is BYOK-only: there is no fermi platform GitHub account, so unlike
-- fal / tavily / openai there is no platform-key fallback (it does not go
-- through resolveKey's tier policy; the tool loads the credential directly).
--
-- Done as an ALTER after `add_fal_to_credential_key_types` so the rebuilt
-- constraint keeps every prior type. (A `DROP CONSTRAINT; ADD CONSTRAINT`
-- replaces the whole CHECK, so this list must be complete.)
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
    'fal',
    'github'
  ));
