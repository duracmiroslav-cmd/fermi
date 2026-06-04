-- Long-term memory the agent curates about the end-user it is talking to.
-- A distinct axis from the knowledge base: knowledge is per (owner, agent) —
-- what the operator taught the agent — while a memory is per (bot, subject) —
-- what the agent learned about the person on the other end. Keying by the
-- subject (not the agent) means recall survives the bot swapping its bound
-- agent: the human is the same human. The agent writes these via the
-- in-process `memory` capability's `save_memory` tool; the worker reads the
-- most recent few back into the system prompt each turn (fenced as untrusted
-- recall — see prompt-guard's renderMemoryBlock).

create table public.memories (
  id                  uuid primary key default gen_random_uuid(),
  bot_id              uuid not null references public.bots(id)  on delete cascade,
  owner_id            uuid not null references public.users(id) on delete cascade,
  subject_type        text not null check (subject_type in ('user', 'group')),
  subject_external_id text not null,
  content             text not null,
  -- Provenance: the run whose loop wrote this. SET NULL (not cascade-delete)
  -- so the memory outlives observability cleanup of its originating run.
  source_run_id       uuid references public.agent_runs(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Every read scopes by the full subject tuple; bot_id leads so one bot's
-- recall can never surface under another even when two bots happen to see the
-- same LINE userId. created_at desc is the recall order (most recent first).
create index memories_subject_idx
  on public.memories (bot_id, subject_type, subject_external_id, created_at desc);

create trigger memories_set_updated_at
  before update on public.memories
  for each row execute function public.set_updated_at();

alter table public.memories enable row level security;

-- Owners can read what their bots remembered (dashboard audit / management).
-- subject_external_id is a LINE-side opaque id, so this exposes nothing the
-- owner doesn't already control.
create policy "Users can view their own memories." on public.memories
  for select using ((select auth.uid()) = owner_id);

-- Writes flow through the worker (service_role) only. Explicit revoke holds
-- even if RLS were ever disabled on the table.
revoke insert, update, delete on public.memories from authenticated;
