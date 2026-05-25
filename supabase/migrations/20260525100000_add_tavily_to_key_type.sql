-- Extends `encrypted_credentials.key_type` to accept `'tavily'` so
-- bot owners can store a personal Tavily API key for the
-- `web_search` tool. Mirrors §11 #18 Phase B: user-supplied Tavily
-- key takes precedence over the `TAVILY_API_KEY` env fallback.

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
    'tavily'
  ));
