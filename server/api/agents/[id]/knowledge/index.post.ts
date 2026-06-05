import { getCurrentUser } from '~~/server/utils/auth';
import { ingestTextDocument } from '~~/server/utils/knowledge';
import { UnsupportedFileError, extractDocumentText } from '~~/shared/documentText';

// Raw upload cap (binary files run larger than their text). The extracted
// text has its own, smaller cap below — that's what actually bounds embedding
// work.
const MAX_FILE_BYTES = 10 * 1024 * 1024;
// ~200k chars ≈ a few hundred chunks; keeps synchronous ingestion bounded.
const MAX_TEXT_CHARS = 200_000;

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);
  const agentId = getUuidParam(event, 'id');

  const admin = useSupabaseAdmin();

  // Ownership check is the authorization: only the agent's owner can add to
  // its knowledge base. A miss is a 404 (don't reveal others' agent ids).
  const { data: agent, error: agentErr } = await admin
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (agentErr) throw agentErr;
  if (!agent) {
    throw createError({ statusCode: 404, statusMessage: 'Agent not found', data: { code: '__errorAgentNotFound' } });
  }

  // Pro-gate: the knowledge base carries platform embedding cost and is a
  // paid capability. Free → 403 with an upsell code the client maps to copy.
  const { data: userRow, error: userErr } = await admin
    .from('users').select('tier').eq('id', user.id).single();
  if (userErr) throw userErr;
  if (userRow.tier !== 'pro') {
    throw createError({ statusCode: 403, statusMessage: 'Knowledge base is a Pro feature', data: { code: '__errorKnowledgeRequiresPro' } });
  }

  const parts = await readMultipartFormData(event);
  const filePart = parts?.find(p => p.name === 'file' && p.filename);
  if (!filePart?.filename || !filePart.data?.length) {
    throw createError({ statusCode: 400, statusMessage: 'No file uploaded' });
  }
  if (filePart.data.length > MAX_FILE_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'File too large' });
  }

  let text: string;
  try {
    text = (await extractDocumentText(filePart.filename, filePart.data)).trim();
  } catch (err) {
    if (err instanceof UnsupportedFileError) {
      throw createError({ statusCode: 415, statusMessage: 'Unsupported file type' });
    }
    // A corrupt / unreadable PDF or Word file lands here.
    throw createError({ statusCode: 422, statusMessage: 'Could not read text from the file' });
  }
  if (!text) {
    throw createError({ statusCode: 422, statusMessage: 'No text found in the file' });
  }
  if (text.length > MAX_TEXT_CHARS) {
    throw createError({ statusCode: 413, statusMessage: 'Document text is too long' });
  }

  const { openaiApiKey } = useRuntimeConfig(event);
  if (!openaiApiKey) {
    throw createError({ statusCode: 503, statusMessage: 'Knowledge base unavailable: platform OpenAI key not configured' });
  }

  const title = filePart.filename.replace(/\.[^.]+$/, '').trim() || filePart.filename;

  return await ingestTextDocument({
    admin,
    ownerId: user.id,
    agentId,
    title,
    text,
    openaiApiKey,
  });
});
