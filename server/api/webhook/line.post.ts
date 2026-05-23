import { validateSignature } from '@line/bot-sdk';
import { z } from 'zod';
import { findChannelByDestination } from '~~/shared/channels';
import { loadCredential } from '~~/shared/credentials';
import { useKek } from '~~/shared/kek';

const webhookBodySchema = z.looseObject({
  destination: z.string().min(1),
  events: z.array(z.unknown()).default([]),
});

export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event);
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty body' });
  }

  const signature = getHeader(event, 'x-line-signature');
  if (!signature) {
    throw createError({ statusCode: 401, statusMessage: 'Missing signature' });
  }

  // Body must be parsed before the signature is verified because
  // `destination` is the only field that identifies which channel's
  // secret to use. The body stays untrusted until validateSignature
  // succeeds below.
  const parsedBody = webhookBodySchema.safeParse(JSON.parse(rawBody));
  if (!parsedBody.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid webhook body' });
  }
  const payload = parsedBody.data;

  const admin = useSupabaseAdmin();
  const channel = await findChannelByDestination(admin, 'line', payload.destination);
  if (!channel) {
    // Unknown or disconnected destination. Return 200 so LINE drops
    // the retry; a 4xx here would keep LINE redelivering until the
    // webhook is marked broken on their side.
    return { ok: true };
  }

  const { fermiKek, supabaseUrl, supabaseServiceRoleKey } = useRuntimeConfig(event);
  const kek = await useKek(fermiKek);
  const { plaintext: channelSecret } = await loadCredential(admin, kek, {
    userId: channel.ownerId,
    channelId: channel.id,
    keyType: 'line_channel_secret',
  });

  if (!validateSignature(rawBody, channelSecret, signature)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' });
  }

  await enqueueWebhookEvent(admin, {
    channelType: 'line',
    channelId: channel.id,
    destination: payload.destination,
    events: payload.events,
  });

  void fetch(`${supabaseUrl}/functions/v1/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceRoleKey}`,
    },
  }).catch(console.error);

  return { ok: true };
});
