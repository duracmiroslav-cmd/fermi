-- Creates the `agents` table, the persona layer (system prompt,
-- default model, avatar). Bots reference an agent via
-- `bots.agent_id` (NOT NULL, ON DELETE RESTRICT, see `bots`).
--
-- `model_provider_id` (NOT NULL FK → model_providers) is the pivot
-- that lets the runtime route per-agent to OpenRouter / OpenAI /
-- Anthropic / Gemini direct without hardcoding a provider.
--
-- `voice_reply_mode` is a 3-valued enum (off / auto / always); the
-- "auto" middle case mirrors the user's input modality and is
-- meaningfully different from both off and always, so this is a text
-- enum rather than a boolean.
--
-- `default_vision_model` (nullable) overrides the worker's hardcoded
-- read-image default (`anthropic/claude-sonnet-4.5`); null = fall back
-- to it. Used whenever a conversation contains an image.
--
-- `default_tts_model` / `default_tts_voice` / `tts_instructions` are
-- nullable overrides for the OpenAI TTS path; null falls back to the
-- worker default (`gpt-4o-mini-tts` + `cedar`). No CHECK constraint
-- on the model / voice columns: the catalog grows with OpenAI, so
-- Zod validates on write and `shared/tts.ts` parses defensively on
-- read. `tts_instructions` is honored only when the model is
-- `gpt-4o-mini-tts` (older models ignore it).
--
-- `normalize_traditional` runs the reply text through OpenCC s2tw
-- (Simplified → Taiwan Traditional, char-level) before delivery. A
-- worker post-process the LLM never invokes, so it's an always-on
-- column, not a capability. Defaults true: fermi is TW-first and the
-- transform is idempotent on already-Traditional / non-Chinese text.

create table public.agents (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.users(id) on delete cascade,
  name                  text not null,
  system_prompt         text,
  default_text_model    text,
  default_vision_model  text,
  default_tts_model     text,
  default_tts_voice     text,
  tts_instructions      text,
  model_provider_id     uuid not null references public.model_providers(id),
  voice_reply_mode      text not null default 'off'
                          check (voice_reply_mode in ('off', 'auto', 'always')),
  normalize_traditional boolean not null default true,
  avatar_url            text,
  is_default            boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

-- Owner lookups always filter deleted_at, so a partial index over
-- the active subset is both smaller and more selective than a full
-- B-tree on owner_id alone.
create index agents_active_owner_idx
  on public.agents(owner_id)
  where deleted_at is null;

-- "Every user has exactly one Default agent" invariant. Partial
-- unique over the live subset so soft-deleting a Default + creating
-- a new one doesn't trip the constraint. The Default is seeded by
-- `handle_new_user` at signup and protected from delete by
-- `delete_agent`.
create unique index agents_one_default_per_owner_idx
  on public.agents(owner_id)
  where is_default and deleted_at is null;

create trigger agents_set_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();

alter table public.agents enable row level security;

create policy "Users can view their own agents." on public.agents
  for select using (
    (select auth.uid()) = owner_id
    and deleted_at is null
  );

-- Writes flow through service_role-only RPCs. Explicit revoke makes
-- this hold even if RLS were ever disabled on the table.
revoke insert, update, delete on public.agents from authenticated;

-- Locks the owner's users row before counting + inserting so two
-- concurrent creates from the same user can't both observe an
-- under-limit count and bypass the tier quota.
create function public.insert_agent_if_under_limit(
  p_owner_id             uuid,
  p_name                 text,
  p_system_prompt        text,
  p_default_text_model   text,
  p_default_vision_model text,
  p_default_tts_model    text,
  p_default_tts_voice    text,
  p_tts_instructions     text,
  p_model_provider_id    uuid,
  p_voice_reply_mode     text,
  p_normalize_traditional boolean,
  p_avatar_url           text,
  p_limit                int
) returns table (id uuid)
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  current_count int;
begin
  perform 1 from public.users where public.users.id = p_owner_id for update;

  select count(*) into current_count
  from public.agents
  where owner_id = p_owner_id and deleted_at is null;

  if current_count >= p_limit then
    raise exception 'agent_limit_reached' using errcode = 'P0001';
  end if;

  return query
    insert into public.agents (owner_id, name, system_prompt, default_text_model, default_vision_model, default_tts_model, default_tts_voice, tts_instructions, model_provider_id, voice_reply_mode, normalize_traditional, avatar_url)
    values (p_owner_id, p_name, p_system_prompt, p_default_text_model, p_default_vision_model, p_default_tts_model, p_default_tts_voice, p_tts_instructions, p_model_provider_id, p_voice_reply_mode, p_normalize_traditional, p_avatar_url)
    returning agents.id;
end;
$$;

revoke execute on function public.insert_agent_if_under_limit(uuid, text, text, text, text, text, text, text, uuid, text, boolean, text, int) from public;
grant  execute on function public.insert_agent_if_under_limit(uuid, text, text, text, text, text, text, text, uuid, text, boolean, text, int) to service_role;
