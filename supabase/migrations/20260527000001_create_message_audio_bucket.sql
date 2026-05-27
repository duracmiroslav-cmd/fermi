-- Creates the `message-audio` storage bucket for both user-sent
-- audio (LINE voice messages, persisted after Whisper transcription
-- for future replay) and TTS-generated audio delivered back via LINE.
-- Private (no public read), 10MB cap matching LINE's per-message limit.
--
-- Mime whitelist: audio/aac is what OpenAI tts-1 returns with
-- response_format='aac'; audio/m4a is the format LINE delivers user
-- voice messages in (AAC inside MP4 container).
--
-- Path conventions:
--   <owner_id>/<thread_id>/<run_id>.aac           — TTS-generated
--   <owner_id>/<thread_id>/in/<line_message_id>.m4a — user-uploaded
-- Both share a per-thread prefix so M3.P2's retention cron can
-- prefix-delete an entire thread's media in one call.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-audio',
  'message-audio',
  false,
  10485760,
  array['audio/aac', 'audio/m4a']
)
on conflict (id) do nothing;

create policy "Owners can read their own message audio"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
