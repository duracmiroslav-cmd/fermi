-- Creates the `message-audio` storage bucket for TTS-generated audio
-- attachments delivered to LINE as audio messages. Private (no public
-- read), 10MB cap matching LINE's per-message size limit.
--
-- Mime whitelist: audio/aac is what OpenAI tts-1 returns with
-- response_format='aac'; audio/m4a is listed as a forward-compatible
-- option in case a future TTS provider lands m4a-wrapped output and
-- we don't want to ship another migration.
--
-- Path convention: <owner_id>/<thread_id>/<run_id>.aac
-- run_id keys the upload so an idempotent retry (pgmq re-delivery)
-- doesn't double-pay TTS for the same agent run.

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
