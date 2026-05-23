import { validateSignature } from '@line/bot-sdk';
import { z } from 'zod';
import { findChannelByDestination } from '~~/shared/channels';
import { loadCredential } from '~~/shared/credentials';
import { getKek } from '~~/shared/kek';

const MAX_BODY_BYTES = 256 * 1024;

const webhookBodySchema = z.looseObject({
  destination: z.string().min(1),
  events: z.array(z.unknown()).default([]),
});

// Hostname must match this for fermi to forward the service-role
// bearer to /functions/v1/agent. A misconfigured SUPABASE_URL would
// otherwise leak the bearer to whatever host it resolves to.
const isTrustedTriggerHost = (url: URL): boolean =>
  (url.protocol === 'https:' && url.hostname.endsWith('.supabase.co'))
  || url.hostname === 'localhost'
  || url.hostname === '127.0.0.1';

export default defineEventHandler(async (event) => {
  const contentLength = Number(getHeader(event, 'content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Payload too large' });
  }

  const rawBody = await readRawBody(event);
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty body' });
  }
  if (rawBody.length > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Payload too large' });
  }

  const signature = getHeader(event, 'x-line-signature');
  if (!signature) {
    throw createError({ statusCode: 401, statusMessage: 'Missing signature' });
  }

  // destination identifies which channel's secret to use, so the body
  // must be parsed before signature verification. It stays untrusted
  // until validateSignature succeeds below.
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
  const kek = await getKek(fermiKek);
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

  const triggerUrl = new URL('/functions/v1/agent', supabaseUrl);
  if (isTrustedTriggerHost(triggerUrl)) {
    void fetch(triggerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceRoleKey}`,
      },
    }).catch(console.error);
  } else {
    console.error('refusing to trigger worker on untrusted host', triggerUrl.hostname);
  }

  return { ok: true };
});
