import { LineBotClient, messagingApi } from '@line/bot-sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { H3Event } from 'h3';
import { storeCredential } from '~~/shared/credentials';
import { getKek } from '~~/shared/kek';
import type { LineBotInput } from '~~/shared/schemas/bots';

// LINE has no API to verify the Channel Secret directly, so connect-time
// verification only confirms the Channel Access Token; a wrong Secret
// surfaces later as a webhook signature mismatch.

// Displays a typing indicator (`...`) in the user's LINE chat for up
// to 60 seconds. Auto-cancels on the next Reply API call, so we can
// fire-and-forget at webhook time and let the worker's eventual reply
// dismiss it. Free, doesn't consume reply or push quota. Only works
// in 1-on-1 chats; group / room sources are no-ops on LINE's side.
export const showLineLoadingAnimation = async (
  channelAccessToken: string,
  userId: string,
): Promise<void> => {
  const client = new messagingApi.MessagingApiClient({ channelAccessToken });
  await client.showLoadingAnimation({ chatId: userId, loadingSeconds: 60 });
};

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

  // Surface a specific 409 instead of leaking the DB unique-index
  // name. The index still guards the race between this check and
  // the RPC insert below — see the 23505 fallback in insertErr.
  const { data: existing, error: existingErr } = await admin
    .from('bots')
    .select('id, owner_id, display_name')
    .eq('platform', 'line')
    .eq('external_id', botInfo.userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: existing.owner_id === userId
        ? `This LINE Channel is already connected to your account as "${existing.display_name ?? 'unnamed'}".`
        : 'This LINE Channel is already connected to another fermi account.',
    });
  }

  // Every user is guaranteed a Default agent by handle_new_user; we
  // attach the new bot to it on create so `bots.agent_id NOT NULL`
  // holds without forcing the user to pick an agent in the connect
  // form. Owners can rebind to a custom agent later from edit.
  const { data: defaultAgent, error: agentErr } = await admin
    .from('agents')
    .select('id')
    .eq('owner_id', userId)
    .eq('is_default', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (agentErr) throw agentErr;
  if (!defaultAgent) {
    throw createError({
      statusCode: 500,
      statusMessage: 'No default agent for user — signup trigger may have failed',
    });
  }

  const { data: rows, error: insertErr } = await admin.rpc('insert_bot_if_under_limit', {
    p_owner_id: userId,
    p_platform: 'line',
    p_external_id: botInfo.userId,
    p_display_name: botInfo.displayName,
    p_agent_id: defaultAgent.id,
    p_limit: limit,
  });
  if (insertErr) {
    if (insertErr.message?.includes('bot_limit_reached')) {
      throw createError({
        statusCode: 403,
        statusMessage: `Bot limit reached (max ${limit})`,
      });
    }
    // Race fallback for the (platform, external_id) unique index —
    // a parallel connect could slot in between the pre-check above
    // and this insert. Same UX as the pre-check, just no ownership
    // disambiguation since we don't have the colliding row in hand.
    if ((insertErr as { code?: string }).code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'This LINE Channel is already connected.',
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

  // Best-effort avatar capture. LINE OAs without a profile picture
  // leave pictureUrl undefined; a save failure here just means the
  // dashboard shows a "sync avatar" button until the owner clicks it.
  if (botInfo.pictureUrl) {
    await admin.from('bots').update({ avatar_url: botInfo.pictureUrl }).eq('id', bot.id);
  }

  const url = getRequestURL(event);
  return {
    id: bot.id,
    platform: 'line',
    displayName: bot.display_name ?? botInfo.displayName,
    webhookUrl: `${url.origin}/api/webhook/line`,
  };
};
