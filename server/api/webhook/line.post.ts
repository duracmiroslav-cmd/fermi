import { validateSignature, type webhook } from '@line/bot-sdk';

export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event);
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty body' });
  }

  const signature = getHeader(event, 'x-line-signature');
  const { lineChannelSecret, supabaseUrl, supabaseServiceRoleKey } = useRuntimeConfig(event);

  if (!signature || !lineChannelSecret || !validateSignature(rawBody, lineChannelSecret, signature)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' });
  }

  const payload = JSON.parse(rawBody) as webhook.CallbackRequest;
  await enqueueWebhookEvent(useSupabaseAdmin(), payload);

  void fetch(`${supabaseUrl}/functions/v1/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceRoleKey}`,
    },
  }).catch(console.error);

  return { ok: true };
});
