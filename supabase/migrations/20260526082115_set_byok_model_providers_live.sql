-- Flips OpenAI / Anthropic / Gemini from coming_soon to live now
-- that /api/connections/{openai,anthropic,gemini} ship in this same
-- change. Status drives the future connections-list UI: 'live' means
-- the catalog row has a working POST endpoint to paste a key into.

update public.model_providers
   set status = 'live'
 where slug in ('openai', 'anthropic', 'gemini')
   and status = 'coming_soon';
