import { getCurrentUser } from '~~/server/utils/auth';

// Idempotent: detaching an unbound capability is a no-op.

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const agentId = getRouterParam(event, 'id');
  const capabilityId = getRouterParam(event, 'capabilityId');
  if (!agentId) {
    throw createError({
      statusCode:    400,
      statusMessage: 'Missing agent id',
      data:          { code: '__errorMissingAgentId' },
    });
  }
  if (!capabilityId) {
    throw createError({
      statusCode:    400,
      statusMessage: 'Missing capability id',
      data:          { code: '__errorMissingCapabilityId' },
    });
  }

  const admin = useSupabaseAdmin();
  const { error: detachErr } = await admin.rpc('detach_capability', {
    p_agent_id:      agentId,
    p_owner_id:      user.id,
    p_capability_id: capabilityId,
  });
  if (detachErr) {
    if (detachErr.message?.includes('agent_not_found')) {
      throw createError({
        statusCode:    404,
        statusMessage: 'Agent not found',
        data:          { code: '__errorAgentNotFound' },
      });
    }
    throw detachErr;
  }

  return { ok: true };
});
