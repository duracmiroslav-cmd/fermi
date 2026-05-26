import { getCurrentUser } from '~~/server/utils/auth';
import { type AgentCapabilityRow, listCapabilitiesForUser } from '~~/server/utils/capabilities';

// Returns the full capability catalog this user can see, each row
// overlaid with whether THIS agent has it attached.

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
  if (!agent) throw createError({ statusCode: 404, statusMessage: 'Agent not found' });

  const [catalog, bindings] = await Promise.all([
    listCapabilitiesForUser(admin, user.id),
    admin
      .from('agent_capabilities')
      .select('capability_id')
      .eq('agent_id', agentId)
      .is('disabled_at', null),
  ]);
  if (bindings.error) throw bindings.error;

  const attachedIds = new Set((bindings.data ?? []).map(b => b.capability_id));

  return catalog.map(row => ({ ...row, attached: attachedIds.has(row.id) }));
});
