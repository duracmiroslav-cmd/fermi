import { LineBotClient, messagingApi } from '@line/bot-sdk';
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
      statusCode:    400,
      statusMessage: 'Invalid LINE Channel Access Token',
    });
  }
};

// Pushes fermi's webhook URL to the LINE channel via Messaging API
// (PUT /v2/bot/channel/webhook/endpoint). Replaces the manual paste
// step in LINE Developer Console.
export const setLineWebhookEndpoint = async (
  channelAccessToken: string,
  endpoint: string,
): Promise<void> => {
  const client = new messagingApi.MessagingApiClient({ channelAccessToken });
  try {
    await client.setWebhookEndpoint({ endpoint });
  } catch (err) {
    throw createError({
      statusCode:    502,
      statusMessage: (err as { message?: string }).message ?? 'Failed to push webhook URL to LINE',
    });
  }
};

// Asks LINE to POST a signed test event to fermi's webhook URL
// (POST /v2/bot/channel/webhook/test). On success the webhook handler
// observes a signed request and sets `webhook_verified_at` as a side
// effect, which is how the bot info checklist learns about completion.
export const testLineWebhookEndpoint = async (
  channelAccessToken: string,
): Promise<messagingApi.TestWebhookEndpointResponse> => {
  const client = new messagingApi.MessagingApiClient({ channelAccessToken });
  try {
    return await client.testWebhookEndpoint();
  } catch (err) {
    throw createError({
      statusCode:    502,
      statusMessage: (err as { message?: string }).message ?? 'LINE webhook test failed',
    });
  }
};

export interface ConnectedBot {
  id:          string;
  platform:    'line';
  displayName: string;
  webhookUrl:  string;
}

export const connectLineBot = async (
  event: H3Event,
  admin: SupabaseClient,
  userId: string,
  input: LineBotInput,
): Promise<ConnectedBot> => {
  const botInfo = await verifyLineBot(input.channelAccessToken);

  // Surface a specific 409 instead of leaking the DB unique-index
  // name. The index still guards the race between this check and
  // the RPC insert below, see the 23505 fallback in insertErr.
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
      statusCode:    409,
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
      statusCode:    500,
      statusMessage: 'No default agent for user, signup trigger may have failed',
    });
  }

  const { data: bot, error: insertErr } = await admin
    .from('bots')
    .insert({
      owner_id:     userId,
      platform:     'line',
      external_id:  botInfo.userId,
      display_name: botInfo.displayName,
      agent_id:     defaultAgent.id,
    })
    .select('id, display_name')
    .single();
  if (insertErr) {
    // Race fallback for the (platform, external_id) unique index.
    // A parallel connect could slot in between the pre-check above
    // and this insert. Same UX as the pre-check, just no ownership
    // disambiguation since we don't have the colliding row in hand.
    if ((insertErr as { code?: string }).code === '23505') {
      throw createError({
        statusCode:    409,
        statusMessage: 'This LINE Channel is already connected.',
      });
    }
    throw insertErr;
  }

  const { fermiKek } = useRuntimeConfig(event);
  const kek = await getKek(fermiKek);

  // Rollback the bot on credential-insert failure so the unique
  // key isn't left pointing at an orphan row.
  try {
    await storeCredential(admin, kek, {
      userId,
      botId:     bot.id,
      keyType:   'line_channel_secret',
      plaintext: input.channelSecret,
    });
    await storeCredential(admin, kek, {
      userId,
      botId:     bot.id,
      keyType:   'line_channel_access_token',
      plaintext: input.channelAccessToken,
    });
  } catch (err) {
    await admin.from('bots').delete().eq('id', bot.id);
    throw err;
  }

  // Capture handle (the @id for friend-add URL + QR) and avatar in
  // one round-trip. LINE Official Accounts without a profile picture
  // leave pictureUrl undefined; a save failure here just means the
  // dashboard shows a "sync avatar" button until the owner clicks it.
  await admin
    .from('bots')
    .update({
      handle:     botInfo.basicId ?? null,
      avatar_url: botInfo.pictureUrl ?? null,
    })
    .eq('id', bot.id);

  const url = getRequestURL(event);
  return {
    id:          bot.id,
    platform:    'line',
    displayName: bot.display_name ?? botInfo.displayName,
    webhookUrl:  `${url.origin}/api/webhook/line`,
  };
};

// Re-enter the Channel Secret + Access Token for an existing bot (e.g. a
// typo'd secret causing webhook 401s). The token is verified first, and
// it must resolve to the SAME LINE channel — different credentials are a
// new bot, not a fix.
export const updateLineBotCredentials = async (
  event: H3Event,
  admin: SupabaseClient,
  userId: string,
  botId: string,
  input: LineBotInput,
): Promise<{ id: string; displayName: string }> => {
  const { data: bot, error: botErr } = await admin
    .from('bots')
    .select('id, external_id')
    .eq('id', botId)
    .eq('owner_id', userId)
    .eq('platform', 'line')
    .is('deleted_at', null)
    .maybeSingle();
  if (botErr) throw botErr;
  if (!bot) {
    throw createError({ statusCode: 404, statusMessage: 'Bot not found', data: { code: '__errorBotNotFound' } });
  }

  // Verify before touching anything, so a bad token fails without
  // clearing the existing (working) credentials.
  const botInfo = await verifyLineBot(input.channelAccessToken);
  if (botInfo.userId !== bot.external_id) {
    throw createError({
      statusCode:    409,
      statusMessage: 'These credentials are for a different LINE Channel. Connect it as a new bot instead.',
      data:          { code: '__errorCredentialsDifferentChannel' },
    });
  }

  const { fermiKek } = useRuntimeConfig(event);
  const kek = await getKek(fermiKek);

  // storeCredential only inserts, so clear the old rows first.
  const { error: removeErr } = await admin
    .from('encrypted_credentials')
    .delete()
    .eq('user_id', userId)
    .eq('bot_id', botId)
    .in('key_type', ['line_channel_secret', 'line_channel_access_token']);
  if (removeErr) throw removeErr;

  await storeCredential(admin, kek, { userId, botId, keyType: 'line_channel_secret', plaintext: input.channelSecret });
  await storeCredential(admin, kek, { userId, botId, keyType: 'line_channel_access_token', plaintext: input.channelAccessToken });

  // Refresh the LINE-mirrored fields while we have fresh bot info.
  await admin.from('bots').update({
    display_name: botInfo.displayName,
    handle:       botInfo.basicId ?? null,
    avatar_url:   botInfo.pictureUrl ?? null,
  }).eq('id', botId);

  return { id: botId, displayName: botInfo.displayName };
};
