-- Cache of LINE group member display names so transcription relay and
-- (later) mention chat can label "who said it" without a profile API
-- call per message. Refreshed on read once past its TTL; see the worker
-- `groupMembers.ts`. Display names are member PII — covered by the
-- group-member disclosure in the privacy policy.

create table public.group_members (
  bot_id            uuid not null references public.bots(id) on delete cascade,
  external_group_id text not null,
  external_user_id  text not null,
  display_name      text,
  picture_url       text,
  cached_at         timestamptz not null default now(),
  primary key (bot_id, external_group_id, external_user_id)
);

alter table public.group_members enable row level security;

-- Owner reads their groups' members through the parent bot.
create policy "Users can view their own group members." on public.group_members
  for select using (
    exists (
      select 1 from public.bots
      where bots.id = group_members.bot_id
        and bots.owner_id = (select auth.uid())
        and bots.deleted_at is null
    )
  );

-- Written by the agent worker via service_role only.
revoke insert, update, delete on public.group_members from authenticated;
