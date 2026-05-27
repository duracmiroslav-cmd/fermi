import { getCurrentUser } from '~~/server/utils/auth';
import { setLineWebhookEndpoint } from '~~/server/utils/bots/line';
import { loadCredential } from '~~/shared/credentials';
import { getKek } from '~~/shared/kek';

// Pushes fermi's `/api/webhook/<platform>` URL to the bot's platform
// (LINE Messaging API for now). Lets the owner skip the manual paste
// + Verify dance in LINE Developer Console.

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);
  const id = getUuidParam(event, 'id');

  const admin = useSupabaseAdmin();
  const { data: bot, error: botErr } = await admin
    .from('bots')
    .select('id, platform')
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (botErr) throw botErr;
  if (!bot) {
    throw createError({ statusCode: 404, statusMessage: 'Bot not found' });
  }
  if (bot.platform !== 'line') {
    throw createError({ statusCode: 400, statusMessage: 'Webhook config only supports LINE bots' });
  }

  const { fermiKek, appUrl } = useRuntimeConfig(event);
  const kek = await getKek(fermiKek);
  const { plaintext: accessToken } = await loadCredential(admin, kek, {
    userId:  user.id,
    botId:   bot.id,
    keyType: 'line_channel_access_token',
  });

  const origin = appUrl || getRequestURL(event).origin;
  const endpoint = `${origin}/api/webhook/${bot.platform}`;

  await setLineWebhookEndpoint(accessToken, endpoint);

  return { ok: true, endpoint };
});
