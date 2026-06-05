import { z } from 'zod';
import { getCurrentUser } from '~~/server/utils/auth';
import { updateLineBotCredentials } from '~~/server/utils/bots/line';

// Re-store an existing LINE bot's Channel Secret + Access Token. The
// platform is implied by the bot, so the body is just the two values.
const bodySchema = z.object({
  channelSecret:      z.string().min(1),
  channelAccessToken: z.string().min(1),
}).strict();

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);
  const id = getUuidParam(event, 'id');

  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }

  const admin = useSupabaseAdmin();
  return updateLineBotCredentials(event, admin, user.id, id, { platform: 'line', ...parsed.data });
});
