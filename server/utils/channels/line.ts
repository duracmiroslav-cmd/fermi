import { LineBotClient, type messagingApi } from '@line/bot-sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { H3Event } from 'h3';
import { storeCredential } from '~~/shared/credentials';
import { useKek } from '~~/shared/kek';
import type { LineChannelInput } from '~~/shared/schemas/channels';

// LINE has no API to verify the Channel Secret directly, so connect-time
// verification only confirms the Channel Access Token; a wrong Secret
// surfaces later as a webhook signature mismatch.

export const verifyLineChannel = async (channelAccessToken: string): Promise<messagingApi.BotInfoResponse> => {
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

export interface ConnectedChannel {
  id: string;
  type: 'line';
  displayName: string;
  webhookUrl: string;
}

export const connectLineChannel = async (
  event: H3Event,
  admin: SupabaseClient,
  userId: string,
  input: LineChannelInput,
  limit: number,
): Promise<ConnectedChannel> => {
  const botInfo = await verifyLineChannel(input.channelAccessToken);

  const { data: rows, error: insertErr } = await admin.rpc('insert_channel_if_under_limit', {
    p_owner_id: userId,
    p_channel_type: 'line',
    p_external_id: botInfo.userId,
    p_display_name: botInfo.displayName,
    p_limit: limit,
  });
  if (insertErr) {
    if (insertErr.message?.includes('channel_limit_reached')) {
      throw createError({
        statusCode: 403,
        statusMessage: `Channel limit reached (max ${limit})`,
      });
    }
    throw insertErr;
  }
  const channel = rows?.[0];
  if (!channel) {
    throw new Error('insert_channel_if_under_limit returned no row');
  }

  const { fermiKek } = useRuntimeConfig(event);
  const kek = await useKek(fermiKek);

  // Sequential credential inserts. A partial failure between the two
  // would leave an orphan channel row, so we rollback by deleting it.
  try {
    await storeCredential(admin, kek, {
      userId,
      channelId: channel.id,
      keyType: 'line_channel_secret',
      plaintext: input.channelSecret,
    });
    await storeCredential(admin, kek, {
      userId,
      channelId: channel.id,
      keyType: 'line_channel_access_token',
      plaintext: input.channelAccessToken,
    });
  } catch (err) {
    await admin.from('channels').delete().eq('id', channel.id);
    throw err;
  }

  const url = getRequestURL(event);
  return {
    id: channel.id,
    type: 'line',
    displayName: channel.display_name ?? botInfo.displayName,
    webhookUrl: `${url.origin}/api/webhook/line`,
  };
};
