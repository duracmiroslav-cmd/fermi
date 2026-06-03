// Knowledge-base ingestion. Runs server-side (not the Edge worker) because
// it's owner-driven dashboard work: chunk the source text, embed each chunk
// via the platform OpenAI key, and persist the document + its chunks. The
// worker only reads back, through `match_knowledge_chunks`.
//
// Text source only for now; URL / PDF ingestion is a fast-follow (Phase 1b)
// and will reuse the worker's SSRF-safe fetch + extraction path.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '~~/app/types/database.types';
import { chunkText } from '~~/shared/chunk';
import { embedTexts, toVectorLiteral } from '~~/shared/embeddings';

// Keep each OpenAI embeddings request modest; the API caps at 2048 inputs but
// smaller batches bound memory and per-request latency.
const EMBED_BATCH = 96;

export interface IngestResult {
  id:         string;
  title:      string;
  charCount:  number;
  chunkCount: number;
  createdAt:  string;
}

export const ingestTextDocument = async (params: {
  admin:        SupabaseClient<Database>;
  ownerId:      string;
  agentId:      string;
  title:        string;
  text:         string;
  openaiApiKey: string;
}): Promise<IngestResult> => {
  const { admin, ownerId, agentId, title, text, openaiApiKey } = params;

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Document has no usable text' });
  }

  // Embed before any insert: if embedding fails (bad key, OpenAI down) we
  // haven't written a half-document.
  const embeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    embeddings.push(...await embedTexts(chunks.slice(i, i + EMBED_BATCH), openaiApiKey));
  }
  // Guards both the no-undefined index access below and the real failure
  // mode of an embeddings response shorter than its input.
  if (embeddings.length !== chunks.length) {
    throw createError({ statusCode: 502, statusMessage: 'Embedding count did not match chunk count' });
  }

  const { data: doc, error: docErr } = await admin
    .from('knowledge_documents')
    .insert({
      owner_id:    ownerId,
      agent_id:    agentId,
      title,
      source_type: 'text',
      char_count:  text.length,
      status:      'ready',
    })
    .select('id, title, char_count, created_at')
    .single();
  if (docErr) throw docErr;

  const rows = chunks.map((content, i) => ({
    document_id: doc.id,
    agent_id:    agentId,
    owner_id:    ownerId,
    chunk_index: i,
    content,
    // pgvector wire form; the column types as `string` in the generated types.
    embedding:   toVectorLiteral(embeddings[i]!),
  }));
  const { error: insertErr } = await admin.from('knowledge_chunks').insert(rows);
  if (insertErr) {
    // Mark the document failed so it doesn't read as healthy-but-empty.
    await admin.from('knowledge_documents').update({ status: 'failed' }).eq('id', doc.id);
    throw insertErr;
  }

  return {
    id:         doc.id,
    title:      doc.title,
    charCount:  doc.char_count,
    chunkCount: chunks.length,
    createdAt:  doc.created_at,
  };
};
