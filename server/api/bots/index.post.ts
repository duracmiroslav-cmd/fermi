import { getCurrentUser } from '~~/server/utils/auth';
import { connectLineBot } from '~~/server/utils/bots/line';
import { BOT_LIMIT, type Tier } from '~~/shared/constants/tiers';
import { connectBotInputSchema } from '~~/shared/schemas/bots';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const body = await readBody(event);
  const parsed = connectBotInputSchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }

  const admin = useSupabaseAdmin();

  const { data: userRow, error: userErr } = await admin
    .from('users').select('tier').eq('id', user.id).single();
  if (userErr) throw userErr;
  const limit = BOT_LIMIT[userRow.tier as Tier];

  const input = parsed.data;
  switch (input.platform) {
    case 'line':
      return connectLineBot(event, admin, user.id, input, limit);
    default: {
      // Adding a new platform without a case here will fail compile.
      const exhaustive: never = input.platform;
      throw createError({
        statusCode:    400,
        statusMessage: `Unsupported platform: ${String(exhaustive)}`,
        data:          { code: '__errorUnsupportedPlatform', platform: String(exhaustive) },
      });
    }
  }
});
