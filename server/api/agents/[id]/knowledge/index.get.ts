import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);
  const agentId = getUuidParam(event, 'id');

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('knowledge_documents')
    .select('id, title, source_type, char_count, status, created_at')
    .eq('agent_id', agentId)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map(d => ({
    id:         d.id,
    title:      d.title,
    sourceType: d.source_type,
    charCount:  d.char_count,
    status:     d.status,
    createdAt:  d.created_at,
  }));
});
