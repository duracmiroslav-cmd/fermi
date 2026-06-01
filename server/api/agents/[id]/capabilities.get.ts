import { getCurrentUser } from '~~/server/utils/auth';
import { type AgentCapabilityRow, listCapabilitiesForUser } from '~~/server/utils/capabilities';

// Each catalog row the user can see, overlaid with whether THIS agent
// has it attached.

export default defineEventHandler(async (event): Promise<AgentCapabilityRow[]> => {
  const user = await getCurrentUser(event);
  const agentId = getUuidParam(event, 'id');

  const admin = useSupabaseAdmin();

  const { data: agent, error: agentErr } = await admin
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (agentErr) throw agentErr;
  if (!agent) {
    throw createError({
      statusCode:    404,
      statusMessage: 'Agent not found',
      data:          { code: '__errorAgentNotFound' },
    });
  }

  const [catalog, bindings] = await Promise.all([
    listCapabilitiesForUser(admin, user.id),
    admin
      .from('agent_capabilities')
      .select('capability_id, config')
      .eq('agent_id', agentId)
      .is('disabled_at', null),
  ]);
  if (bindings.error) throw bindings.error;

  const bindingMap = new Map(
    (bindings.data ?? []).map(b => [b.capability_id, b]),
  );

  return catalog.map(row => ({
    ...row,
    attached:    bindingMap.has(row.id),
    agentConfig: (bindingMap.get(row.id)?.config ?? {}) as Record<string, unknown>,
  }));
});
