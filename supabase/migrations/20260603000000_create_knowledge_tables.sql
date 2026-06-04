-- Knowledge base (RAG) storage. An agent's knowledge base is the set of
-- `knowledge_documents` attached to it; each document is split into
-- `knowledge_chunks`, each carrying an embedding for semantic retrieval.
-- The agent reaches these via the in-process `knowledge-search` capability
-- (`supabase/functions/agent/tools/knowledge-search.ts`), which embeds the
-- query and calls `match_knowledge_chunks`. Ingestion runs server-side
-- (`server/utils/knowledge.ts`).
--
-- Embeddings are OpenAI `text-embedding-3-small` (1536-dim, multilingual).
-- The dimension is BAKED INTO the column: switching embedding models means
-- a migration + re-embedding every chunk (vectors aren't comparable across
-- models). Chosen deliberately for Traditional-Chinese retrieval quality —
-- Supabase's built-in local `gte-small` is English-only.

create extension if not exists vector;

create table public.knowledge_documents (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id)  on delete cascade,
  agent_id    uuid not null references public.agents(id) on delete cascade,
  title       text not null,
  source_type text not null check (source_type in ('text', 'url')),
  source_url  text,
  char_count  int  not null default 0,
  status      text not null default 'ready' check (status in ('ready', 'failed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- Owner/agent lookups always filter deleted_at, so a partial index over the
-- active subset is smaller and more selective than a full B-tree.
create index knowledge_documents_active_agent_idx
  on public.knowledge_documents(agent_id)
  where deleted_at is null;

create trigger knowledge_documents_set_updated_at
  before update on public.knowledge_documents
  for each row execute function public.set_updated_at();

-- Chunks carry denormalized agent_id / owner_id so retrieval scopes by agent
-- in one indexed predicate (no join to documents) and RLS reads owner_id
-- directly. Hard-deleting a document cascades its chunks away.
create table public.knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  agent_id    uuid not null references public.agents(id) on delete cascade,
  owner_id    uuid not null references public.users(id)  on delete cascade,
  chunk_index int  not null,
  content     text not null,
  embedding   vector(1536) not null,
  created_at  timestamptz not null default now()
);

-- Retrieval filters by agent_id first (small candidate set), then ranks by
-- cosine distance via HNSW.
create index knowledge_chunks_agent_idx on public.knowledge_chunks(agent_id);
create index knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks    enable row level security;

create policy "Users can view their own knowledge documents." on public.knowledge_documents
  for select using (
    (select auth.uid()) = owner_id
    and deleted_at is null
  );

-- Chunks are never read by the client (only the worker via the match RPC),
-- but a select policy keeps them owner-scoped for any future dashboard view.
create policy "Users can view their own knowledge chunks." on public.knowledge_chunks
  for select using ((select auth.uid()) = owner_id);

-- Writes flow through service_role (ingestion is server-side). Explicit
-- revoke holds even if RLS were ever disabled on the tables.
revoke insert, update, delete on public.knowledge_documents from authenticated;
revoke insert, update, delete on public.knowledge_chunks    from authenticated;

-- Semantic retrieval: the top `p_match_count` chunks for one agent whose
-- cosine similarity to the query clears `p_min_similarity`. Called by the
-- worker (service_role) with the agent's own id, so ownership is already
-- trusted — the agent_id filter is the scope boundary. Returns content only;
-- the LLM never needs chunk ids.
create function public.match_knowledge_chunks(
  p_agent_id        uuid,
  p_query_embedding vector(1536),
  p_match_count     int,
  p_min_similarity  float
) returns table (
  content    text,
  similarity float
)
  language sql
  stable
  security definer
  set search_path = public
as $$
  select
    c.content,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.knowledge_chunks c
  where c.agent_id = p_agent_id
    and 1 - (c.embedding <=> p_query_embedding) >= p_min_similarity
  order by c.embedding <=> p_query_embedding
  limit p_match_count;
$$;

revoke execute on function public.match_knowledge_chunks(uuid, vector, int, float) from public;
grant  execute on function public.match_knowledge_chunks(uuid, vector, int, float) to service_role;
