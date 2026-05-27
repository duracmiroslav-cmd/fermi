import { z } from 'zod';
import { getCurrentUser } from '~~/server/utils/auth';

// Attaches a capability to one of the caller's agents. Idempotent:
// re-attaching an already-bound capability is a no-op, so frontend
// can call this without checking first.

const bodySchema = z.object({
  capabilityId: z.string().uuid(),
});

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const agentId = getRouterParam(event, 'id');
  if (!agentId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing agent id' });
  }

  const body = await readBody(event);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }

  const admin = useSupabaseAdmin();
  const { error: attachErr } = await admin.rpc('attach_capability', {
    p_agent_id: agentId,
    p_owner_id: user.id,
    p_capability_id: parsed.data.capabilityId,
  });
  if (attachErr) {
    if (attachErr.message?.includes('agent_not_found')) {
      throw createError({ statusCode: 404, statusMessage: 'Agent not found' });
    }
    if (attachErr.message?.includes('capability_not_found')) {
      throw createError({ statusCode: 404, statusMessage: 'Capability not found' });
    }
    throw attachErr;
  }

  return { ok: true };
});
