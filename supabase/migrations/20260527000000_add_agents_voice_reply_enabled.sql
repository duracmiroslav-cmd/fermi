-- Per-agent flag: when true, the worker synthesizes the assistant's
-- final text via OpenAI tts-1 and delivers it as a LINE audio message
-- (with text fallback on TTS failure). Defaults to false so existing
-- agents stay text-only without explicit opt-in.
--
-- Boolean rather than mode-enum because today's choice is binary
-- (text vs voice reply). If a third reply mode appears (e.g. "voice
-- + transcript caption"), promote to a text enum then.

alter table public.agents
  add column voice_reply_enabled boolean not null default false;
