import { getCurrentUser } from '~~/server/utils/auth';
import { testLineWebhookEndpoint } from '~~/server/utils/bots/line';
import { loadCredential } from '~~/shared/credentials';
import { getKek } from '~~/shared/kek';

// Asks LINE to POST a signed test event to fermi's webhook URL.
// LINE blocks until our handler responds, so by the time this route
// returns the webhook handler has already had a chance to set
// `webhook_verified_at` (fire-and-forget) for a successful test.

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
    throw createError({ statusCode: 400, statusMessage: 'Webhook test only supports LINE bots' });
  }

  const { fermiKek } = useRuntimeConfig(event);
  const kek = await getKek(fermiKek);
  const { plaintext: accessToken } = await loadCredential(admin, kek, {
    userId: user.id,
    botId: bot.id,
    keyType: 'line_channel_access_token',
  });

  const result = await testLineWebhookEndpoint(accessToken);

  return {
    success: result.success ?? false,
    statusCode: result.statusCode,
    reason: result.reason,
    detail: result.detail,
    timestamp: result.timestamp,
  };
});
