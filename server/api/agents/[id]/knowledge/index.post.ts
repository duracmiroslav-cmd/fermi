import { z } from 'zod';
import { getCurrentUser } from '~~/server/utils/auth';
import { ingestTextDocument } from '~~/server/utils/knowledge';

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  text:  z.string().min(1).max(50000),
}).strict();

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);
  const agentId = getUuidParam(event, 'id');

  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }

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

  const { openaiApiKey } = useRuntimeConfig(event);
  if (!openaiApiKey) {
    throw createError({ statusCode: 503, statusMessage: 'Knowledge base unavailable: platform OpenAI key not configured' });
  }

  return await ingestTextDocument({
    admin,
    ownerId: user.id,
    agentId,
    title:   parsed.data.title,
    text:    parsed.data.text,
    openaiApiKey,
  });
});
