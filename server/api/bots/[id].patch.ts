import { getCurrentUser } from '~~/server/utils/auth';
import { updateBotInputSchema } from '~~/shared/schemas/bots';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing bot id' });
  }

  const body = await readBody(event);
  const parsed = updateBotInputSchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }
  const input = parsed.data;

  // Explicit camel→snake mapping picks writable columns. Strict schema
  // rejects unknown keys upstream.
  const patch: Record<string, unknown> = {};
  if ('agentId' in input) patch.agent_id = input.agentId;
  if ('displayName' in input) patch.display_name = input.displayName;
  if ('enabled' in input) patch.enabled = input.enabled;
  if ('allowGroups' in input) patch.allow_groups = input.allowGroups;

  if (Object.keys(patch).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' });
  }

  const admin = useSupabaseAdmin();

  if (typeof input.agentId === 'string') {
    const { data: agent, error: agentErr } = await admin
      .from('agents')
      .select('id')
      .eq('id', input.agentId)
      .eq('owner_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (agentErr) throw agentErr;
    if (!agent) {
      throw createError({ statusCode: 404, statusMessage: 'Agent not found' });
    }
  }

  const { data, error } = await admin
    .from('bots')
    .update(patch)
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .select('id, platform, external_id, display_name, agent_id, enabled, allow_groups, updated_at')
    .maybeSingle();
  if (error) {
    // Unique violation on agent_id (1:1 binding enforced at DB level).
    if (error.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'Agent is already bound to another bot',
      });
    }
    throw error;
  }
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Bot not found' });
  }

  return {
    id: data.id,
    platform: data.platform,
    externalId: data.external_id,
    displayName: data.display_name,
    agentId: data.agent_id,
    enabled: data.enabled,
    allowGroups: data.allow_groups,
    updatedAt: data.updated_at,
  };
});
