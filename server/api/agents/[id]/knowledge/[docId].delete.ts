import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);
  const agentId = getUuidParam(event, 'id');
  const docId = getUuidParam(event, 'docId');

  const admin = useSupabaseAdmin();

  // Soft-delete the document (matches the codebase's content soft-delete
  // convention), scoped to the caller's own agent.
  const { data, error } = await admin
    .from('knowledge_documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', docId)
    .eq('agent_id', agentId)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Document not found', data: { code: '__errorKnowledgeDocNotFound' } });
  }

  // Hard-delete the chunks: they're derived data (not content worth keeping),
  // cost vector storage, and must stop being retrievable the moment the doc
  // is removed — the match RPC scopes by agent_id, not by document status.
  const { error: chunkErr } = await admin
    .from('knowledge_chunks')
    .delete()
    .eq('document_id', docId);
  if (chunkErr) throw chunkErr;

  return { id: docId };
});
