import { z } from 'zod';
import { getCurrentUser } from '~~/server/utils/auth';

// Updates the per-agent config override for one capability binding.
// Supplied fields shallow-override the capability's global defaults at
// runtime; omitted fields continue to inherit the global value.

const bodySchema = z.object({
  config: z.record(z.unknown()),
});

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const agentId = getUuidParam(event, 'id');
  const capabilityId = getUuidParam(event, 'capabilityId');

  const body = await readBody(event);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }

  const admin = useSupabaseAdmin();
  const { error: updateErr } = await admin.rpc('update_capability_config', {
    p_agent_id:      agentId,
    p_owner_id:      user.id,
    p_capability_id: capabilityId,
    p_config:        parsed.data.config,
  });
  if (updateErr) {
    if (updateErr.message?.includes('agent_not_found')) {
      throw createError({ statusCode: 404, statusMessage: 'Agent not found' });
    }
    if (updateErr.message?.includes('binding_not_found')) {
      throw createError({ statusCode: 404, statusMessage: 'Capability not attached' });
    }
    throw updateErr;
  }

  return { ok: true };
});
