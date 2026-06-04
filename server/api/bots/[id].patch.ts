import type { Database } from '~~/app/types/database.types';
import { getCurrentUser } from '~~/server/utils/auth';
import { updateBotInputSchema } from '~~/shared/schemas/bots';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const id = getUuidParam(event, 'id');

  const body = await readBody(event);
  const parsed = updateBotInputSchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }
  const input = parsed.data;

  const patch: Database['public']['Tables']['bots']['Update'] = {};
  if ('agentId' in input) patch.agent_id = input.agentId;
  if ('disabledAt' in input) patch.disabled_at = input.disabledAt;
  if ('groupActivationCode' in input) patch.group_activation_code = input.groupActivationCode;
  if ('groupTranscribeEnabled' in input) patch.group_transcribe_enabled = input.groupTranscribeEnabled;

  if (Object.keys(patch).length === 0) {
    throw createError({
      statusCode:    400,
      statusMessage: 'No fields to update',
      data:          { code: '__errorNoFieldsToUpdate' },
    });
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
      throw createError({
        statusCode:    404,
        statusMessage: 'Agent not found',
        data:          { code: '__errorAgentNotFound' },
      });
    }
  }

  const { data, error } = await admin
    .from('bots')
    .update(patch)
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .select('id, platform, external_id, display_name, agent_id, disabled_at, updated_at')
    .maybeSingle();
  if (error) {
    // Unique violation on agent_id (1:1 binding enforced at DB level).
    if (error.code === '23505') {
      throw createError({
        statusCode:    409,
        statusMessage: 'Agent is already bound to another bot',
        data:          { code: '__errorAgentAlreadyBound' },
      });
    }
    throw error;
  }
  if (!data) {
    throw createError({
      statusCode:    404,
      statusMessage: 'Bot not found',
      data:          { code: '__errorBotNotFound' },
    });
  }

  return {
    id:          data.id,
    platform:    data.platform,
    externalId:  data.external_id,
    displayName: data.display_name,
    agentId:     data.agent_id,
    disabledAt:  data.disabled_at,
    updatedAt:   data.updated_at,
  };
});
