import { createClient } from '@supabase/supabase-js';
import { loadActiveCapabilitySlugs } from '../../../shared/agentCapabilities.ts';
import { type AudioMime, detectAudioMime } from '../../../shared/audio.ts';
import { detectImageMime, type ImageMime } from '../../../shared/image.ts';
import { findAgentById } from '../../../shared/agents.ts';
import { findBotById } from '../../../shared/bots.ts';
import { loadCredential } from '../../../shared/credentials.ts';
import { getKek } from '../../../shared/kek.ts';
import {
  FreeBYOKRequiredError,
  PlatformKeyNotConfiguredError,
  resolveKey,
} from '../../../shared/keys.ts';
import { signMessageAudioUrl, uploadMessageAudio } from '../../../shared/messageAudio.ts';
import { uploadMessageImage } from '../../../shared/messageImages.ts';
import { tryClaimIdempotencyKey } from './dedup.ts';
import { LineContentError, fetchLineMessageContent } from './line-content.ts';
import { OpenRouterError, chatCompletion, type ChatMessage } from './openrouter.ts';
import { errorCodeFromStatus, finishRun, logStep, startRun } from './runs.ts';
import { WhisperError, transcribeAudio } from './stt.ts';
import { synthesizeSpeech } from './tts.ts';
import {
  appendMessage,
  loadRecentMessages,
  resolveOrCreateLatestThread,
} from './threads.ts';
import { executeTool, toolSchemasForCapabilities } from './tools/index.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const fermiKek = Deno.env.get('FERMI_KEK')!;

const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEFAULT_TEXT_MODEL = 'anthropic/claude-opus-4.7';
// Vision-capable fallback used for any run whose history contains
// an image, regardless of agent.defaultTextModel. Per-agent vision
// override is a follow-up; for now hardcoded so users can't pick a
// text-only model and silently break image conversations.
const DEFAULT_VISION_MODEL = 'anthropic/claude-sonnet-4.5';
const HISTORY_WINDOW = 20;
// Hard cap on LLM iterations within a single agent run. One iteration
// = one OpenRouter call. A typical multi-step query (read calendar →
// search docs → answer) finishes in 3-5; 8 leaves headroom without
// risking the Edge Function's 400s wall clock when tools are slow.
const MAX_AGENT_STEPS = 8;

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
  message?: { type: string; id?: string; text?: string };
  webhookEventId?: string;
}

// What the user just sent for this turn. Discriminated at the event
// boundary in processLineMessage; runAgentLoop only sees the
// validated form.
type UserInput
  = | { type: 'text';  text: string }
    | { type: 'image'; lineMessageId: string; mime: ImageMime; bytes: Uint8Array };

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

// LINE outbound message shapes we emit. Adding a new variant (image,
// flex, sticker) extends the union here, the JSON.stringify body just
// forwards the discriminated object straight to LINE's API.
export type LineMessage
  = | { type: 'text';  text: string }
    | { type: 'audio'; originalContentUrl: string; duration: number };

const replyMessage = async (
  accessToken: string,
  replyToken: string,
  message: LineMessage,
): Promise<void> => {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages: [message] }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new LineReplyError(res.status, `LINE Reply API ${res.status}: ${body}`);
  }
};

const pushMessage = async (
  accessToken: string,
  to: string,
  message: LineMessage,
): Promise<void> => {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to, messages: [message] }),
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
  message: LineMessage;
  elapsedMs: number;
}): Promise<DeliveryMethod> => {
  const { accessToken, replyToken, userId, message, elapsedMs } = params;

  if (elapsedMs >= REPLY_BUDGET_MS) {
    await pushMessage(accessToken, userId, message);
    return 'push';
  }

  try {
    await replyMessage(accessToken, replyToken, message);
    return 'reply';
  } catch (err) {
    if (err instanceof LineReplyError && err.status === 400) {
      await pushMessage(accessToken, userId, message);
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
    await replyMessage(accessToken, replyToken, { type: 'text', text });
  } catch (err) {
    if (err instanceof LineReplyError && err.status === 400) {
      console.warn('reply token expired or already used; dropping', { replyToken });
      return;
    }
    throw err;
  }
};

const NO_AGENT_NOTICE = '⚙️ 這個 bot 還沒設定 agent，請到 https://fermi.tw/dashboard 綁定一個。';
// Free tier: BYOK is the friction point. Notice surfaces both paths so
// the bot owner can pick connect (manual) or upgrade (instant).
const FREE_BYOK_NOTICE_OPENROUTER
  = '⚙️ 還沒連接 OpenRouter。Free 方案請到 https://fermi.tw/dashboard/connections 連接，或升級 Pro 由 fermi 代管。';
const PLATFORM_KEY_OPS_NOTICE = '⚠️ Pro 服務暫時不可用，已通知 fermi 處理，請稍後再試。';
const FREE_BYOK_NOTICE_OPENAI
  = '🎙️ 語音功能需要 OpenAI key。Free 方案請到 https://fermi.tw/dashboard/connections 連接，或升級 Pro 由 fermi 代管。';

const PLATFORM_OPENROUTER_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? null;
const PLATFORM_OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? null;

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

const isImageMessageFromUser = (event: LineEvent): event is LineEvent & {
  replyToken: string;
  source: LineSource & { userId: string };
  message: { type: 'image'; id: string };
} => (
  event.type === 'message'
  && event.message?.type === 'image'
  && typeof event.message.id === 'string'
  && typeof event.replyToken === 'string'
  && event.source?.type === 'user'
  && typeof event.source.userId === 'string'
);

const isAudioMessageFromUser = (event: LineEvent): event is LineEvent & {
  replyToken: string;
  source: LineSource & { userId: string };
  message: { type: 'audio'; id: string };
} => (
  event.type === 'message'
  && event.message?.type === 'audio'
  && typeof event.message.id === 'string'
  && typeof event.replyToken === 'string'
  && event.source?.type === 'user'
  && typeof event.source.userId === 'string'
);

// Reply-bearing user message of any modality we accept. Used by the
// "no agent / no openrouter key" early-return paths so a message of
// any supported type arriving in those states still gets the
// configuration notice.
const isReplyableUserMessage = (event: LineEvent): event is LineEvent & {
  replyToken: string;
  source: LineSource & { userId: string };
} => (
  isTextMessageFromUser(event)
  || isImageMessageFromUser(event)
  || isAudioMessageFromUser(event)
);

const runAgentLoop = async (params: {
  bot: { id: string; ownerId: string };
  agent: {
    id: string;
    name: string;
    systemPrompt: string | null;
    defaultTextModel: string | null;
    voiceReplyEnabled: boolean;
  };
  openrouterKey: string;
  lineAccessToken: string;
  kek: CryptoKey;
  externalUserId: string;
  replyToken: string;
  userInput: UserInput;
  // Webhook timestamp from LINE (ms since epoch). Anchors the
  // reply-token budget — we time elapsed from when LINE delivered
  // the event, not when our worker dequeued it.
  eventTimestamp: number;
}): Promise<void> => {
  const { bot, agent, openrouterKey, lineAccessToken, kek, externalUserId, replyToken, userInput, eventTimestamp } = params;

  const threadId = await resolveOrCreateLatestThread(admin, bot.id, externalUserId);
  if (userInput.type === 'text') {
    await appendMessage(admin, threadId, 'user', { type: 'text', text: userInput.text });
  } else {
    const { storagePath } = await uploadMessageImage(admin, {
      ownerId: bot.ownerId,
      threadId,
      lineMessageId: userInput.lineMessageId,
      mime: userInput.mime,
      bytes: userInput.bytes,
    });
    await appendMessage(admin, threadId, 'user', {
      type: 'image',
      mime: userInput.mime,
      sizeBytes: userInput.bytes.byteLength,
      storagePath,
    });
  }

  const runId = await startRun(admin, {
    threadId,
    botId:   bot.id,
    agentId: agent.id,
    ownerId: bot.ownerId,
  });
  let step = 1;
  let totalCostUsd = 0;

  try {
    // Resolved once per run: capability attachment changes mid-loop
    // (e.g. user toggles in dashboard) shouldn't reshape the tool set
    // an LLM call already in flight believes it has.
    const attachedSlugs = await loadActiveCapabilitySlugs(admin, agent.id);
    const tools = toolSchemasForCapabilities(attachedSlugs);

    const history = await loadRecentMessages(admin, threadId, HISTORY_WINDOW);
    const systemPrompt = agent.systemPrompt
      ?? `You are ${agent.name}, a helpful assistant on LINE. Reply in the user's language.`;
    // Any image in the history window forces a vision-capable model.
    // Without this, an agent configured with a text-only model would
    // silently 4xx the moment an image enters its conversation.
    const hasImageInHistory = history.some((m) =>
      Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url'),
    );
    const model = hasImageInHistory
      ? DEFAULT_VISION_MODEL
      : (agent.defaultTextModel ?? DEFAULT_TEXT_MODEL);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
    ];

    let finalText: string | null = null;
    let iteration = 0;
    while (iteration < MAX_AGENT_STEPS) {
      iteration++;

      await logStep(admin, {
        runId,
        step: step++,
        type: 'llm_requested',
        payload: { model, message_count: messages.length, iteration },
      });

      const llmStart = performance.now();
      const result = await chatCompletion({
        apiKey: openrouterKey,
        model,
        messages,
        tools,
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
          has_tool_calls: result.toolCalls !== null,
        },
        latencyMs: llmLatency,
        costUsd: result.costUsd,
        openrouterGenId: result.generationId,
      });

      // No tool calls — model's final answer. Exit loop.
      if (!result.toolCalls) {
        finalText = result.text ?? '';
        break;
      }

      // Re-attach the assistant turn (including tool_calls) so the
      // next LLM iteration sees the exchange. OpenAI's format requires
      // each tool message to immediately follow the assistant turn
      // that requested it.
      messages.push({
        role: 'assistant',
        content: result.text,
        tool_calls: result.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.argumentsJson },
        })),
      });

      for (const call of result.toolCalls) {
        await logStep(admin, {
          runId,
          step: step++,
          type: 'tool_called',
          payload: {
            tool_call_id: call.id,
            name: call.name,
            arguments: call.argumentsJson,
          },
        });

        const toolStart = performance.now();
        const toolResult = await executeTool(call.name, call.argumentsJson, {
          admin,
          kek,
          ownerId: bot.ownerId,
        });
        const toolLatency = Math.round(performance.now() - toolStart);

        await logStep(admin, {
          runId,
          step: step++,
          type: 'tool_responded',
          payload: {
            tool_call_id: call.id,
            name: call.name,
            // Truncated preview keeps payload row size sane; full
            // result still flows back to the model via the tool turn.
            result_preview: toolResult.slice(0, 500),
          },
          latencyMs: toolLatency,
        });

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: toolResult,
        });
      }
    }

    // Hit the step cap without a terminal assistant turn. Send the
    // user a clear "I stopped" notice rather than nothing.
    if (finalText === null) {
      finalText = `⚠️ 跑了 ${MAX_AGENT_STEPS} 步還沒收斂，先停下來。可以換個方式問我一次。`;
    }

    await appendMessage(admin, threadId, 'assistant', { type: 'text', text: finalText });

    // Voice-reply agents synthesize the final text and deliver as a
    // LINE audio message. Any failure along the path (Free without
    // OpenAI BYOK, platform env unset, OpenAI 4xx/5xx, upload error)
    // falls back to text — better a text reply than no reply. The
    // text variant of `finalText` is the canonical record in `messages`.
    let deliveryMessage: LineMessage = { type: 'text', text: `🤖 ${finalText}` };
    if (agent.voiceReplyEnabled) {
      try {
        const resolved = await resolveKey(admin, kek, {
          ownerId: bot.ownerId,
          purpose: 'openai',
          platformKey: PLATFORM_OPENAI_KEY,
        });
        const speech = await synthesizeSpeech({ apiKey: resolved.key, text: finalText });
        const { storagePath } = await uploadMessageAudio(admin, {
          ownerId: bot.ownerId,
          threadId,
          runId,
          mime: speech.mime,
          bytes: speech.bytes,
        });
        const signedUrl = await signMessageAudioUrl(admin, storagePath);
        deliveryMessage = {
          type: 'audio',
          originalContentUrl: signedUrl,
          duration: speech.durationMs,
        };
      } catch (ttsErr) {
        console.warn('TTS failed; falling back to text', {
          agentId: agent.id,
          ownerId: bot.ownerId,
          err: String(ttsErr),
        });
      }
    }

    const elapsedMs = Date.now() - eventTimestamp;
    try {
      const method = await deliverMessage({
        accessToken: lineAccessToken,
        replyToken,
        userId: externalUserId,
        message: deliveryMessage,
        elapsedMs,
      });
      await logStep(admin, {
        runId,
        step: step++,
        type: 'push_succeeded',
        payload: { method, elapsed_ms: elapsedMs },
      });
      // Mark the moment this bot first delivered a reply end-to-end.
      // Drives the "Setup complete" prompt on the info page — only an
      // actual reply (not LINE's verify ping) counts. Idempotent via
      // .is(null) so subsequent replies leave the first timestamp.
      await admin
        .from('bots')
        .update({ first_replied_at: new Date().toISOString() })
        .eq('id', bot.id)
        .is('first_replied_at', null);
      await finishRun(admin, runId, 'succeeded', totalCostUsd);
    } catch (err) {
      const pushStatus = err instanceof LineReplyError || err instanceof LinePushError
        ? err.status
        : undefined;
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
      await finishRun(admin, runId, 'failed', totalCostUsd, errorCodeFromStatus(pushStatus));
      // Both Reply 400 (fallback to Push already tried) and Push 4xx
      // are terminal for this event — retrying via pgmq would just
      // duplicate the failure or, worse, re-charge a successful Push.
      // Bubble for any other error so pgmq retries the whole payload.
      if (err instanceof LinePushError) return;
      throw err;
    }
  } catch (err) {
    const errStatus = err instanceof OpenRouterError ? err.status : undefined;
    const payload: Record<string, unknown> = { message: String(err) };
    if (err instanceof OpenRouterError) payload.status = err.status;
    await logStep(admin, {
      runId,
      step: step++,
      type: 'error_occurred',
      payload,
    });
    // Surface the failure to LINE so the user (and dogfooding owner)
    // sees what went wrong instead of staring at a vanished `...`.
    // v1 ships the raw error string for fast dogfooding — once we
    // have non-trusted users this needs to switch to a friendly
    // notice + admin-only debug link (see roadmap M3 P1).
    let userNotified = false;
    try {
      await deliverMessage({
        accessToken: lineAccessToken,
        replyToken,
        userId: externalUserId,
        message: { type: 'text', text: formatErrorForLine(err) },
        elapsedMs: Date.now() - eventTimestamp,
      });
      userNotified = true;
    } catch (notifyErr) {
      console.error('error notice delivery failed', notifyErr);
    }
    await finishRun(admin, runId, 'failed', totalCostUsd, errorCodeFromStatus(errStatus));
    // Retry semantics flip on whether the user saw the error: once
    // notified, throwing would have pgmq redeliver and we'd spam the
    // chat with a duplicate ⚠️ every visibility-timeout (~30s). If
    // notice itself failed (LINE 5xx), keep the throw so pgmq can
    // retry — maybe the next attempt lands while LINE is back up.
    if (userNotified) return;
    throw err;
  }
};

// Wraps a runtime error for display in a LINE chat. The error classes
// (OpenRouterError / LineReplyError / LinePushError) already self-
// format with their status code, so we just prefix `⚠️` and truncate
// to keep the message well under LINE's 5000-char limit.
const formatErrorForLine = (err: unknown): string => {
  const maxLen = 400;
  const message = err instanceof OpenRouterError
    || err instanceof LineReplyError
    || err instanceof LinePushError
    ? err.message
    : `fermi error: ${String(err)}`;
  return `⚠️ ${message.slice(0, maxLen)}`;
};

// Filters out events whose webhookEventId we've already processed
// (pgmq re-delivery, LINE webhook retry). Events without a
// webhookEventId fall through unguarded — defensive only; LINE has
// set this field on every webhook event since 2021.
const claimFreshEvents = async (events: LineEvent[]): Promise<LineEvent[]> => {
  const fresh: LineEvent[] = [];
  for (const event of events) {
    if (!event.webhookEventId) {
      fresh.push(event);
      continue;
    }
    const claimed = await tryClaimIdempotencyKey(admin, 'line', event.webhookEventId);
    if (claimed) fresh.push(event);
    else console.info('duplicate webhook event, skipping', { webhookEventId: event.webhookEventId });
  }
  return fresh;
};

const processLineMessage = async (payload: LinePayload): Promise<void> => {
  const events = await claimFreshEvents(payload.events ?? []);
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
      if (isReplyableUserMessage(event)) {
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
      if (isReplyableUserMessage(event)) {
        await safeReply(lineAccessToken, event.replyToken, NO_AGENT_NOTICE);
      }
    }
    return;
  }

  let openrouterKey: string;
  try {
    const resolved = await resolveKey(admin, kek, {
      ownerId: bot.ownerId,
      purpose: 'openrouter',
      platformKey: PLATFORM_OPENROUTER_KEY,
    });
    openrouterKey = resolved.key;
  } catch (err) {
    // FreeBYOKRequiredError = owner is on Free + hasn't connected.
    // PlatformKeyNotConfiguredError = Pro user but fermi's env is missing
    // (operational issue on our side; user-facing message must not blame
    // the user). Any other throw is a real DB/decryption error → bubble
    // so pgmq retries.
    const notice = err instanceof FreeBYOKRequiredError
      ? FREE_BYOK_NOTICE_OPENROUTER
      : err instanceof PlatformKeyNotConfiguredError
        ? PLATFORM_KEY_OPS_NOTICE
        : null;
    if (notice === null) throw err;
    if (err instanceof PlatformKeyNotConfiguredError) {
      console.error('platform OpenRouter key missing for Pro user', { ownerId: bot.ownerId });
    }
    for (const event of events) {
      if (isReplyableUserMessage(event)) {
        await safeReply(lineAccessToken, event.replyToken, notice);
      }
    }
    return;
  }

  for (const event of events) {
    // LINE always sets `timestamp` on webhook events. The fallback
    // covers malformed payloads only; assuming "just arrived" keeps
    // us on Reply, and a 400 still falls back to Push internally.
    const eventTimestamp = typeof event.timestamp === 'number' ? event.timestamp : Date.now();

    if (isTextMessageFromUser(event)) {
      await runAgentLoop({
        bot,
        agent,
        openrouterKey,
        lineAccessToken,
        kek,
        externalUserId: event.source.userId,
        replyToken: event.replyToken,
        userInput: { type: 'text', text: event.message.text },
        eventTimestamp,
      });
      continue;
    }

    if (isImageMessageFromUser(event)) {
      let imageBytes: Uint8Array;
      let mime: ImageMime;
      try {
        const content = await fetchLineMessageContent(lineAccessToken, event.message.id);
        const detected = detectImageMime(content.bytes);
        if (!detected) {
          await safeReply(lineAccessToken, event.replyToken, '⚠️ 目前只支援 JPG / PNG / GIF / WebP。');
          continue;
        }
        mime = detected;
        imageBytes = content.bytes;
      } catch (err) {
        if (err instanceof LineContentError && err.status === 413) {
          await safeReply(lineAccessToken, event.replyToken, '⚠️ 圖片太大，上限 10MB。');
          continue;
        }
        throw err;
      }
      await runAgentLoop({
        bot,
        agent,
        openrouterKey,
        lineAccessToken,
        kek,
        externalUserId: event.source.userId,
        replyToken: event.replyToken,
        userInput: { type: 'image', lineMessageId: event.message.id, mime, bytes: imageBytes },
        eventTimestamp,
      });
      continue;
    }

    if (isAudioMessageFromUser(event)) {
      let audioBytes: Uint8Array;
      let audioMime: AudioMime;
      try {
        const content = await fetchLineMessageContent(lineAccessToken, event.message.id);
        const detected = detectAudioMime(content.bytes);
        if (!detected) {
          await safeReply(lineAccessToken, event.replyToken, '⚠️ 不支援的音訊格式。');
          continue;
        }
        audioMime = detected;
        audioBytes = content.bytes;
      } catch (err) {
        if (err instanceof LineContentError && err.status === 413) {
          await safeReply(lineAccessToken, event.replyToken, '⚠️ 音訊太大，上限 10MB。');
          continue;
        }
        throw err;
      }

      // STT runs *before* the agent loop because the rest of the
      // pipeline only knows text + image. Whisper turns audio into
      // text, then the loop proceeds exactly like a typed message.
      // Errors here short-circuit with a user-facing notice — no
      // agent_run is started for failed transcriptions.
      let openaiKey: string;
      try {
        const resolved = await resolveKey(admin, kek, {
          ownerId: bot.ownerId,
          purpose: 'openai',
          platformKey: PLATFORM_OPENAI_KEY,
        });
        openaiKey = resolved.key;
      } catch (err) {
        if (err instanceof FreeBYOKRequiredError) {
          await safeReply(lineAccessToken, event.replyToken, FREE_BYOK_NOTICE_OPENAI);
          continue;
        }
        if (err instanceof PlatformKeyNotConfiguredError) {
          console.error('platform OpenAI key missing for Pro user', { ownerId: bot.ownerId });
          await safeReply(lineAccessToken, event.replyToken, PLATFORM_KEY_OPS_NOTICE);
          continue;
        }
        throw err;
      }

      let transcript: string;
      try {
        transcript = await transcribeAudio({ apiKey: openaiKey, bytes: audioBytes, mime: audioMime });
      } catch (err) {
        if (err instanceof WhisperError) {
          console.warn('Whisper failed; dropping audio', { status: err.status });
          await safeReply(lineAccessToken, event.replyToken, '⚠️ 無法辨識這段語音，請再試一次。');
          continue;
        }
        throw err;
      }
      if (transcript.length === 0) {
        await safeReply(lineAccessToken, event.replyToken, '⚠️ 沒聽清楚，請再試一次。');
        continue;
      }

      // `[audio]` prefix flags the modality so the LLM knows the input
      // was transcribed (homophones / accent errors are common, the
      // model can ask for clarification when ambiguous). Stored in
      // messages history as plain text so re-loads don't re-pay
      // Whisper.
      await runAgentLoop({
        bot,
        agent,
        openrouterKey,
        lineAccessToken,
        kek,
        externalUserId: event.source.userId,
        replyToken: event.replyToken,
        userInput: { type: 'text', text: `[audio] ${transcript}` },
        eventTimestamp,
      });
      continue;
    }

    // Fallback for message events whose subtype we don't support yet:
    // sticker / video / file / location / imagemap. Reply once with a
    // clear scope notice so the user knows what to send instead.
    // Non-message events (follow / unfollow / postback / ...) drop
    // through silently — they have no replyToken to address.
    if (
      event.type === 'message'
      && typeof event.replyToken === 'string'
      && event.source?.type === 'user'
    ) {
      await safeReply(
        lineAccessToken,
        event.replyToken,
        '⚠️ 目前只支援文字、圖片、語音訊息。',
      );
    }
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
    visibility_timeout: 120,
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
      const { error: archiveErr } = await admin.rpc('archive_webhook_event', { msg_id });
      if (archiveErr) {
        console.error('archive failed', { msg_id, archiveErr });
      }
    } catch (err) {
      console.error('process failed; leaving for retry', { msg_id, err });
    }
  }

  return new Response(JSON.stringify({ processed: messages.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
