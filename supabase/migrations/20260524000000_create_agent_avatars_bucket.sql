-- Creates the `agent-avatars` storage bucket for agent avatar images
-- plus RLS policies that scope writes to the owner's `user_id`
-- folder and allow public read. Public read lets browsers fetch
-- avatar URLs without auth.
--
-- Path convention: <user_id>/<agent_id>.<ext>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agent-avatars',
  'agent-avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- (storage.foldername(name))[1] returns the first path segment.
create policy "Owners can upload agent avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'agent-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Owners can update agent avatars"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'agent-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Owners can delete agent avatars"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'agent-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Anyone can read agent avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'agent-avatars');
