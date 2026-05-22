import { LineBotClient, type messagingApi } from '@line/bot-sdk';

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
