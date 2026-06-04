import { validateSignature } from '@line/bot-sdk';
import { z } from 'zod';
import { checkBotUserRateLimit } from '~~/server/utils/rate-limit';
import { findBotByExternalId } from '~~/shared/bots';
import { loadCredential } from '~~/shared/credentials';
import { getKek } from '~~/shared/kek';

const MAX_BODY_BYTES = 256 * 1024;

// Only `message` events from a `user` source can show a loading
// animation, group / room chats don't surface the indicator and
// non-message events (follow / postback / etc.) don't expect one.
const userMessageEventSchema = z.object({
  type:   z.literal('message'),
  source: z.object({
    type:   z.literal('user'),
    userId: z.string().min(1),
  }),
});

const webhookBodySchema = z.looseObject({
  destination: z.string().min(1),
  events:      z.array(z.unknown()).default([]),
});

const collectUserSourceIds = (events: unknown[]): string[] => {
  const ids = new Set<string>();
  for (const event of events) {
    const parsed = userMessageEventSchema.safeParse(event);
    if (parsed.success) ids.add(parsed.data.source.userId);
  }
  return [...ids];
};

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

  // destination identifies which bot's secret to use, so the body must
  // be parsed before signature verification. It stays untrusted until
  // validateSignature succeeds below.
  const parsedBody = webhookBodySchema.safeParse(JSON.parse(rawBody));
  if (!parsedBody.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid webhook body' });
  }
  const payload = parsedBody.data;

  const admin = useSupabaseAdmin();
  const bot = await findBotByExternalId(admin, 'line', payload.destination);
  if (!bot) {
    // Unknown or disconnected destination. Return 200 so LINE drops
    // the retry; a 4xx here would keep LINE redelivering until the
    // webhook is marked broken on their side.
    return { ok: true };
  }

  const { fermiKek, upstashUrl, upstashToken } = useRuntimeConfig(event);
  const kek = await getKek(fermiKek);
  const { plaintext: channelSecret } = await loadCredential(admin, kek, {
    userId:  bot.ownerId,
    botId:   bot.id,
    keyType: 'line_channel_secret',
  });

  if (!validateSignature(rawBody, channelSecret, signature)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid signature' });
  }

  // First signed webhook for this bot proves end-to-end setup
  // (URL reachable, secret matches, LINE-side webhook enabled).
  // Filter on `webhook_verified_at is null` keeps the write idempotent
  // so later events don't overwrite the original timestamp. Fire-and-
  // forget, must not block the 1-second response window LINE owes.
  void admin
    .from('bots')
    .update({ webhook_verified_at: new Date().toISOString() })
    .eq('id', bot.id)
    .is('webhook_verified_at', null)
    .then(({ error: touchErr }) => {
      if (touchErr) console.error('webhook_verified_at touch failed', touchErr);
    });

  // Rate-limit per (bot, external user) before enqueue. Block →
  // silent drop (no loading animation, no enqueue): showing "..."
  // would tell an abuser their request was accepted, and enqueueing
  // would still burn worker capacity. If *any* user in this webhook
  // is blocked, drop the whole webhook — multi-user webhooks are
  // vanishingly rare on the platform we support, so partitioning
  // events would add complexity without protecting real users.
  const userIds = collectUserSourceIds(payload.events);
  const counterEnv = {
    upstashUrl:   upstashUrl || null,
    upstashToken: upstashToken || null,
  };
  const rateLimitResults = await Promise.all(
    userIds.map(async (uid) => {
      const outcome = await checkBotUserRateLimit(admin, counterEnv, {
        botId:          bot.id,
        externalUserId: uid,
      });
      return { uid, outcome };
    }),
  );
  const blocked = rateLimitResults.filter(r => !r.outcome.allowed);
  if (blocked.length > 0) {
    for (const b of blocked) {
      console.warn('rate_limited', {
        event:          'rate_limited',
        botId:          bot.id,
        externalUserId: b.uid,
        scope:          b.outcome.blockingScope,
        counts:         b.outcome.counts,
      });
    }
    return { ok: true };
  }

  // The typing indicator is primed by the worker (Deno, never frozen) as its
  // first act per message, not here: a fire-and-forget LINE call from this
  // serverless handler gets frozen the moment the 200 is sent, so it showed
  // the "..." only by luck.
  await enqueueWebhookEvent(admin, {
    platform:    'line',
    botId:       bot.id,
    destination: payload.destination,
    events:      payload.events,
  });

  // The worker is triggered from Postgres inside enqueue_webhook_event
  // (net.http_post on the always-on DB). Triggering here instead would mean
  // a fire-and-forget fetch the serverless runtime freezes the moment this
  // 200 is sent, dropping the trigger at random and leaving the event for
  // the minute-aligned pg_cron drain (~tens of seconds of lag).
  return { ok: true };
});
