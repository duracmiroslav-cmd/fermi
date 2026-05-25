-- Adds `bots.avatar_url` so the dashboard can show the LINE Official Account's
-- profile picture instead of a letter-initial placeholder. Mirrors
-- the `avatar_url` column on `agents` and `users` for visual /
-- naming consistency across the schema.
--
-- Source of the value: LINE's `/v2/bot/info` endpoint returns
-- `pictureUrl`. fermi pulls it at connect time and via an explicit
-- refresh action (LINE doesn't push avatar-changed webhooks, so a
-- bot owner who edits their OA picture in LINE Manager has to
-- trigger the sync themselves).
--
-- Nullable: a freshly-connected OA may have no profile picture, and
-- existing pre-migration rows have no avatar yet. Both cases render
-- as a "sync avatar" button in the UI instead of a broken image.

alter table public.bots
  add column avatar_url text;
