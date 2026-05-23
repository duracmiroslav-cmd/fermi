import { validateSignature, type webhook } from '@line/bot-sdk';
import { loadCredential } from '~~/shared/credentials';
import { useKek } from '~~/shared/kek';

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
  const payload = JSON.parse(rawBody) as webhook.CallbackRequest;
  if (!payload.destination) {
    throw createError({ statusCode: 400, statusMessage: 'Missing destination' });
  }

  const admin = useSupabaseAdmin();
  const channel = await findLineChannelByDestination(admin, payload.destination);
  if (!channel) {
    throw createError({ statusCode: 401, statusMessage: 'Unknown channel' });
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

  await enqueueWebhookEvent(admin, { channelId: channel.id, ...payload });

  void fetch(`${supabaseUrl}/functions/v1/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceRoleKey}`,
    },
  }).catch(console.error);

  return { ok: true };
});
