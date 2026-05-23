import { getCurrentUser } from '~~/server/utils/auth';
import { CHANNEL_LIMIT, type Tier } from '~~/shared/constants/tiers';
import { connectChannelInputSchema } from '~~/shared/schemas/channels';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const body = await readBody(event);
  const parsed = connectChannelInputSchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }

  const admin = useSupabaseAdmin();

  const { data: userRow, error: userErr } = await admin
    .from('users').select('tier').eq('id', user.id).single();
  if (userErr) throw userErr;
  const limit = CHANNEL_LIMIT[userRow.tier as Tier];

  const input = parsed.data;
  switch (input.type) {
    case 'line':
      return connectLineChannel(event, admin, user.id, input, limit);
    default: {
      // Adding a new ChannelType without a case here will fail compile.
      const exhaustive: never = input.type;
      throw createError({ statusCode: 400, statusMessage: `Unsupported channel type: ${String(exhaustive)}` });
    }
  }
});
