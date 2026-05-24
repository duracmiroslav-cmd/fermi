import { LineBotClient, type messagingApi } from '@line/bot-sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { H3Event } from 'h3';
import { storeCredential } from '~~/shared/credentials';
import { getKek } from '~~/shared/kek';
import type { LineBotInput } from '~~/shared/schemas/bots';

// LINE has no API to verify the Channel Secret directly, so connect-time
// verification only confirms the Channel Access Token; a wrong Secret
// surfaces later as a webhook signature mismatch.

export const verifyLineBot = async (channelAccessToken: string): Promise<messagingApi.BotInfoResponse> => {
  const client = LineBotClient.fromChannelAccessToken({ channelAccessToken });
  try {
    return await client.getBotInfo();
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid LINE Channel Access Token',
    });
  }
};

export interface ConnectedBot {
  id: string;
  platform: 'line';
  displayName: string;
  webhookUrl: string;
}

export const connectLineBot = async (
  event: H3Event,
  admin: SupabaseClient,
  userId: string,
  input: LineBotInput,
  limit: number,
): Promise<ConnectedBot> => {
  const botInfo = await verifyLineBot(input.channelAccessToken);

  const { data: rows, error: insertErr } = await admin.rpc('insert_bot_if_under_limit', {
    p_owner_id: userId,
    p_platform: 'line',
    p_external_id: botInfo.userId,
    p_display_name: botInfo.displayName,
    p_limit: limit,
  });
  if (insertErr) {
    if (insertErr.message?.includes('bot_limit_reached')) {
      throw createError({
        statusCode: 403,
        statusMessage: `Bot limit reached (max ${limit})`,
      });
    }
    throw insertErr;
  }
  const bot = rows?.[0];
  if (!bot) {
    throw new Error('insert_bot_if_under_limit returned no row');
  }

  const { fermiKek } = useRuntimeConfig(event);
  const kek = await getKek(fermiKek);

  // Rollback the bot on credential-insert failure so the unique
  // key isn't left pointing at an orphan row.
  try {
    await storeCredential(admin, kek, {
      userId,
      botId: bot.id,
      keyType: 'line_channel_secret',
      plaintext: input.channelSecret,
    });
    await storeCredential(admin, kek, {
      userId,
      botId: bot.id,
      keyType: 'line_channel_access_token',
      plaintext: input.channelAccessToken,
    });
  } catch (err) {
    await admin.from('bots').delete().eq('id', bot.id);
    throw err;
  }

  const url = getRequestURL(event);
  return {
    id: bot.id,
    platform: 'line',
    displayName: bot.display_name ?? botInfo.displayName,
    webhookUrl: `${url.origin}/api/webhook/line`,
  };
};
