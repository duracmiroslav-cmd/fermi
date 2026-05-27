-- Creates the `message-images` storage bucket for vision-tool image
-- attachments. Private (no public read), 10MB cap matching LINE's
-- own per-message image size limit. Worker writes via service_role
-- (bypasses RLS); owners can read their own files for the future
-- admin / debug viewer.
--
-- Vision flow: worker fetches the image from LINE once on Turn 1,
-- uploads here, then issues fresh signed URLs on subsequent turns
-- so the LLM provider fetches directly from Storage — no further
-- worker bandwidth.
--
-- Path conventions:
--   <owner_id>/<thread_id>/in/<line_message_id>.<ext>  — user-uploaded
--   <owner_id>/<thread_id>/out/<image_id>.<ext>        — fermi-generated
-- `in/` + `out/` describe direction of flow; both share a per-thread
-- prefix so M3.P2's retention cron can prefix-delete an entire
-- thread's media in one storage call regardless of source.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-images',
  'message-images',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Future admin viewer reads via authenticated session. Service role
-- writes/deletes/signs need no policy (RLS-bypassed). Signed URLs
-- themselves bypass RLS once issued.
create policy "Owners can read their own message images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
