import { getCurrentUser } from '~~/server/utils/auth';
import { AGENT_LIMIT, type Tier } from '~~/shared/constants/tiers';
import { createAgentInputSchema } from '~~/shared/schemas/agents';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const body = await readBody(event);
  const parsed = createAgentInputSchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }
  const input = parsed.data;

  const admin = useSupabaseAdmin();

  const { data: userRow, error: userErr } = await admin
    .from('users').select('tier').eq('id', user.id).single();
  if (userErr) throw userErr;
  const limit = AGENT_LIMIT[userRow.tier as Tier];

  const { data: rows, error: insertErr } = await admin.rpc('insert_agent_if_under_limit', {
    p_owner_id: user.id,
    p_name: input.name,
    p_system_prompt: input.systemPrompt ?? null,
    p_default_model: input.defaultModel ?? null,
    p_avatar_url: input.avatarUrl ?? null,
    p_limit: limit,
  });
  if (insertErr) {
    if (insertErr.message?.includes('agent_limit_reached')) {
      throw createError({
        statusCode: 403,
        statusMessage: `Agent limit reached (max ${limit})`,
      });
    }
    throw insertErr;
  }
  const agent = rows?.[0];
  if (!agent) {
    throw new Error('insert_agent_if_under_limit returned no row');
  }

  return {
    id: agent.id,
    name: input.name,
    systemPrompt: input.systemPrompt ?? null,
    defaultModel: input.defaultModel ?? null,
    avatarUrl: input.avatarUrl ?? null,
  };
});
