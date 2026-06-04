-- Creates `purge_expired_group_messages` and a daily pg_cron job. This is
-- the one deliberate exception to the "never auto-purge history" rule
-- stated in purge_orphaned_credentials: group members aren't fermi users
-- and never consented to their messages being stored, so group content
-- gets a 90-day ceiling. 1:1 content stays permanent (untouched).
--
-- Group `user` messages are text rows (voice arrives as a transcript, not
-- bytes), so deleting rows fully clears member content. Assistant-side
-- media (TTS / generated images, only when the owner opts in) can orphan
-- its storage object here — that's fermi's own output, not member PII, so
-- a later storage-cleanup pass handles it; it doesn't block this purge.
--
-- 90 days mirrors `GROUP_MESSAGE_RETENTION_DAYS` in shared/constants/limits.ts;
-- keep both in sync.

create function public.purge_expired_group_messages(
  older_than interval default interval '90 days'
) returns int
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_count int;
begin
  with deleted as (
    delete from public.messages m
    using public.threads t
    where m.thread_id = t.id
      and t.subject_type = 'group'
      and m.created_at < now() - older_than
    returning m.id
  )
  select count(*) into v_count from deleted;

  return v_count;
end;
$$;

revoke execute on function public.purge_expired_group_messages(interval) from public;
grant  execute on function public.purge_expired_group_messages(interval) to service_role;

-- Runs daily at 04:00 UTC (offset from purge-orphaned-credentials at 03:00).
select cron.schedule(
  'purge-expired-group-messages',
  '0 4 * * *',
  $$ select public.purge_expired_group_messages(); $$
);
