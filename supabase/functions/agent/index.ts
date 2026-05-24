import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { findAgentById } from '../../../shared/agents.ts';
import { findBotById } from '../../../shared/bots.ts';
import { loadCredential } from '../../../shared/credentials.ts';
import { getKek } from '../../../shared/kek.ts';
import { OpenRouterError, chatCompletion } from './openrouter.ts';
import { finishRun, logStep, startRun } from './runs.ts';
import {
  appendMessage,
  loadRecentMessages,
  resolveOrCreateLatestThread,
} from './threads.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const fermiKek = Deno.env.get('FERMI_KEK')!;

const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEFAULT_MODEL = 'anthropic/claude-opus-4.7';
const HISTORY_WINDOW = 20;

interface LineSource {
  type: 'user' | 'group' | 'room';
  userId?: string;
  groupId?: string;
  roomId?: string;
}

interface LineEvent {
  type: string;
  timestamp?: number;
  replyToken?: string;
  source?: LineSource;
  message?: { type: string; text?: string };
}

interface LinePayload {
  platform: 'line';
  botId: string;
  destination?: string;
  events?: LineEvent[];
}

type QueuePayload = LinePayload;

interface QueueMessage {
  msg_id: number;
  payload: QueuePayload;
}

class LineReplyError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

class LinePushError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

// LINE reply tokens are valid roughly one minute from webhook delivery.
// Switch to Push API once we've burned ~25s — leaves comfortable
// headroom for the LLM call still in flight and the LINE round-trip,
// and avoids a Reply 400 wasting the only delivery attempt.
const REPLY_BUDGET_MS = 25_000;

const replyText = async (
  accessToken: string,
  replyToken: string,
  text: string,
): Promise<void> => {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new LineReplyError(res.status, `LINE Reply API ${res.status}: ${body}`);
  }
};

const pushText = async (
  accessToken: string,
  to: string,
  text: string,
): Promise<void> => {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'text', text }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new LinePushError(res.status, `LINE Push API ${res.status}: ${body}`);
  }
};

export type DeliveryMethod = 'reply' | 'push';

// Delivers the bot's response, picking Reply (free) when we're inside
// the reply-token window and Push (quota) when we're not. If a Reply
// attempt fails with 400 (token expired or already used), falls back
// to Push so the message isn't dropped on the floor.
const deliverMessage = async (params: {
  accessToken: string;
  replyToken: string;
  userId: string;
  text: string;
  elapsedMs: number;
}): Promise<DeliveryMethod> => {
  const { accessToken, replyToken, userId, text, elapsedMs } = params;

  if (elapsedMs >= REPLY_BUDGET_MS) {
    await pushText(accessToken, userId, text);
    return 'push';
  }

  try {
    await replyText(accessToken, replyToken, text);
    return 'reply';
  } catch (err) {
    if (err instanceof LineReplyError && err.status === 400) {
      await pushText(accessToken, userId, text);
      return 'push';
    }
    throw err;
  }
};

// LINE Reply tokens are single-use and expire shortly; a 400 from
// the Reply API is terminal. Other errors bubble up so pgmq retries
// the whole webhook payload.
const safeReply = async (
  accessToken: string,
  replyToken: string,
  text: string,
): Promise<void> => {
  try {
    await replyText(accessToken, replyToken, text);
  } catch (err) {
    if (err instanceof LineReplyError && err.status === 400) {
      console.warn('reply token expired or already used; dropping', { replyToken });
      return;
    }
    throw err;
  }
};

const NO_AGENT_NOTICE = '⚙️ 這個 bot 還沒設定 agent，請到 https://fermi.tw/dashboard 綁定一個。';
const NO_OPENROUTER_NOTICE = '⚙️ fermi 還沒連接 OpenRouter，請到 https://fermi.tw/dashboard/connections 連接。';

const tryLoadOpenRouterKey = async (
  admin: SupabaseClient,
  kek: CryptoKey,
  userId: string,
): Promise<string | null> => {
  try {
    const { plaintext } = await loadCredential(admin, kek, {
      userId,
      botId: null,
      keyType: 'openrouter',
    });
    return plaintext;
  } catch (err) {
    // PGRST116 from PostgREST's .single() when no rows match — the
    // user simply hasn't connected OpenRouter yet.
    if ((err as { code?: string })?.code === 'PGRST116') return null;
    throw err;
  }
};

const isTextMessageFromUser = (event: LineEvent): event is LineEvent & {
  replyToken: string;
  source: LineSource & { userId: string };
  message: { type: 'text'; text: string };
} => (
  event.type === 'message'
  && event.message?.type === 'text'
  && typeof event.message.text === 'string'
  && typeof event.replyToken === 'string'
  && event.source?.type === 'user'
  && typeof event.source.userId === 'string'
);

const runAgentLoop = async (params: {
  bot: { id: string; ownerId: string };
  agent: { id: string; name: string; systemPrompt: string | null; defaultModel: string | null };
  openrouterKey: string;
  lineAccessToken: string;
  externalUserId: string;
  replyToken: string;
  userText: string;
  // Webhook timestamp from LINE (ms since epoch). Anchors the
  // reply-token budget — we time elapsed from when LINE delivered
  // the event, not when our worker dequeued it.
  eventTimestamp: number;
}): Promise<void> => {
  const { bot, agent, openrouterKey, lineAccessToken, externalUserId, replyToken, userText, eventTimestamp } = params;

  const threadId = await resolveOrCreateLatestThread(admin, bot.id, externalUserId);
  await appendMessage(admin, threadId, 'user', { type: 'text', text: userText });

  const runId = await startRun(admin, threadId);
  let step = 1;
  let totalCostUsd = 0;

  try {
    const history = await loadRecentMessages(admin, threadId, HISTORY_WINDOW);
    const systemPrompt = agent.systemPrompt
      ?? `You are ${agent.name}, a helpful assistant on LINE. Reply in the user's language.`;
    const model = agent.defaultModel ?? DEFAULT_MODEL;

    await logStep(admin, {
      runId,
      step: step++,
      type: 'llm_requested',
      payload: { model, message_count: history.length },
    });

    const llmStart = performance.now();
    const result = await chatCompletion({
      apiKey: openrouterKey,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
      ],
    });
    const llmLatency = Math.round(performance.now() - llmStart);
    totalCostUsd += result.costUsd;

    await logStep(admin, {
      runId,
      step: step++,
      type: 'llm_responded',
      payload: {
        model: result.model,
        finish_reason: result.finishReason,
        usage: result.usage,
      },
      latencyMs: llmLatency,
      costUsd: result.costUsd,
      openrouterGenId: result.generationId,
    });

    await appendMessage(admin, threadId, 'assistant', { type: 'text', text: result.text });

    const elapsedMs = Date.now() - eventTimestamp;
    try {
      const method = await deliverMessage({
        accessToken: lineAccessToken,
        replyToken,
        userId: externalUserId,
        text: `🤖 ${result.text}`,
        elapsedMs,
      });
      await logStep(admin, {
        runId,
        step: step++,
        type: 'push_succeeded',
        payload: { method, elapsed_ms: elapsedMs },
      });
      await finishRun(admin, runId, 'succeeded', totalCostUsd);
    } catch (err) {
      const payload: Record<string, unknown> = { message: String(err), elapsed_ms: elapsedMs };
      if (err instanceof LineReplyError) {
        payload.status = err.status;
        payload.method = 'reply';
      }
      if (err instanceof LinePushError) {
        payload.status = err.status;
        payload.method = 'push';
      }
      await logStep(admin, {
        runId,
        step: step++,
        type: 'push_failed',
        payload,
      });
      await finishRun(admin, runId, 'failed', totalCostUsd);
      // Both Reply 400 (fallback to Push already tried) and Push 4xx
      // are terminal for this event — retrying via pgmq would just
      // duplicate the failure or, worse, re-charge a successful Push.
      // Bubble for any other error so pgmq retries the whole payload.
      if (err instanceof LinePushError) return;
      throw err;
    }
  } catch (err) {
    const payload: Record<string, unknown> = { message: String(err) };
    if (err instanceof OpenRouterError) payload.status = err.status;
    await logStep(admin, {
      runId,
      step: step++,
      type: 'error_occurred',
      payload,
    });
    await finishRun(admin, runId, 'failed', totalCostUsd);
    throw err;
  }
};

const processLineMessage = async (payload: LinePayload): Promise<void> => {
  const events = payload.events ?? [];
  if (events.length === 0) return;

  const bot = await findBotById(admin, payload.botId);
  if (!bot) {
    // Bot was deleted or disabled between enqueue and dequeue. Either
    // way the right move is to drop the queued event silently.
    console.warn('bot inactive; dropping message', { botId: payload.botId });
    return;
  }

  const kek = await getKek(fermiKek);
  const { plaintext: lineAccessToken } = await loadCredential(admin, kek, {
    userId: bot.ownerId,
    botId: bot.id,
    keyType: 'line_channel_access_token',
  });

  // Bot has no agent bound, or the binding was cleared (agent soft-
  // deleted). Reply with an actionable message instead of silence.
  if (!bot.agentId) {
    for (const event of events) {
      if (isTextMessageFromUser(event)) {
        await safeReply(lineAccessToken, event.replyToken, NO_AGENT_NOTICE);
      }
    }
    return;
  }

  const agent = await findAgentById(admin, bot.agentId);
  if (!agent) {
    // Defensive: bot points to an agent that findAgentById can't load
    // (race or manual SQL). Same UX as no-agent.
    for (const event of events) {
      if (isTextMessageFromUser(event)) {
        await safeReply(lineAccessToken, event.replyToken, NO_AGENT_NOTICE);
      }
    }
    return;
  }

  const openrouterKey = await tryLoadOpenRouterKey(admin, kek, bot.ownerId);
  if (!openrouterKey) {
    for (const event of events) {
      if (isTextMessageFromUser(event)) {
        await safeReply(lineAccessToken, event.replyToken, NO_OPENROUTER_NOTICE);
      }
    }
    return;
  }

  for (const event of events) {
    if (!isTextMessageFromUser(event)) continue;
    await runAgentLoop({
      bot,
      agent,
      openrouterKey,
      lineAccessToken,
      externalUserId: event.source.userId,
      replyToken: event.replyToken,
      userText: event.message.text,
      // LINE always sets `timestamp` on webhook events. The fallback
      // covers malformed payloads only; assuming "just arrived" keeps
      // us on Reply, and a 400 still falls back to Push internally.
      eventTimestamp: typeof event.timestamp === 'number' ? event.timestamp : Date.now(),
    });
  }
};

const processMessage = async (payload: QueuePayload): Promise<void> => {
  switch (payload.platform) {
    case 'line':
      await processLineMessage(payload);
      return;
    default: {
      // Adding a new platform without a case here will fail compile.
      const exhaustive: never = payload.platform;
      console.warn('unknown platform; dropping', { platform: exhaustive });
    }
  }
};

Deno.serve(async () => {
  const { data, error } = await admin.rpc('dequeue_webhook_events', {
    batch_size: 10,
    visibility_timeout: 30,
  });

  if (error) {
    console.error('dequeue failed', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const messages = (data ?? []) as QueueMessage[];

  for (const { msg_id, payload } of messages) {
    try {
      await processMessage(payload);
      const { error: archiveError } = await admin.rpc('archive_webhook_event', { msg_id });
      if (archiveError) {
        console.error('archive failed', { msg_id, archiveError });
      }
    } catch (err) {
      console.error('process failed; leaving for retry', { msg_id, err });
    }
  }

  return new Response(JSON.stringify({ processed: messages.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
