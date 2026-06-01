import { getCurrentUser } from '~~/server/utils/auth';
import { verifyLineBot } from '~~/server/utils/bots/line';
import { loadCredential } from '~~/shared/credentials';
import { getKek } from '~~/shared/kek';

// Re-fetches a LINE bot's profile (avatar, display name) from
// /v2/bot/info and writes back any changes. LINE doesn't push
// avatar-changed webhooks, so the bot owner triggers this manually
// from the dashboard whenever they update the OA in LINE Manager.

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      statusCode:    400,
      statusMessage: 'Missing bot id',
      data:          { code: '__errorMissingBotId' },
    });
  }

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
    throw createError({
      statusCode:    404,
      statusMessage: 'Bot not found',
      data:          { code: '__errorBotNotFound' },
    });
  }
  if (bot.platform !== 'line') {
    throw createError({
      statusCode:    400,
      statusMessage: 'Refresh only supports LINE bots',
      data:          { code: '__errorBotLineOnly' },
    });
  }

  const { fermiKek } = useRuntimeConfig(event);
  const kek = await getKek(fermiKek);
  const { plaintext: accessToken } = await loadCredential(admin, kek, {
    userId:  user.id,
    botId:   bot.id,
    keyType: 'line_channel_access_token',
  });

  const botInfo = await verifyLineBot(accessToken);

  // Whatever LINE returns is now ground truth, including null avatar
  // (an OA that removed its picture should clear fermi's copy too).
  const patch = {
    display_name: botInfo.displayName,
    avatar_url:   botInfo.pictureUrl ?? null,
    handle:       botInfo.basicId ?? null,
  };
  const { data: updated, error: updateErr } = await admin
    .from('bots')
    .update(patch)
    .eq('id', bot.id)
    .select('id, display_name, avatar_url, handle')
    .single();
  if (updateErr) throw updateErr;

  return {
    id:          updated.id,
    displayName: updated.display_name,
    avatarUrl:   updated.avatar_url,
    handle:      updated.handle,
  };
});
