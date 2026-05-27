-- Per-agent reply modality control. Three modes:
--   off    , text reply always (default; no TTS cost)
--   auto   , voice reply when user input was audio; text otherwise
--             (mirrors the user's modality, natural-conversation feel)
--   always , voice reply regardless of input (language-learning bots,
--             accessibility, story-telling personas)
--
-- text enum rather than boolean because the dimension is genuinely
-- 3-valued, not 2 (the "auto" case is meaningfully different from
-- both off and always). Future modes ("voice + text caption") extend
-- the CHECK list in a follow-up migration.

alter table public.agents
  add column voice_reply_mode text not null default 'off'
    check (voice_reply_mode in ('off', 'auto', 'always'));
