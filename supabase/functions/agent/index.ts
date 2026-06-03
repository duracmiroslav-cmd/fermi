import { createClient } from '@supabase/supabase-js';
import { loadActiveCapabilities } from '../../../shared/agentCapabilities.ts';
import { type AudioMime, detectAudioMime } from '../../../shared/audio.ts';
import { detectImageMime, type ImageMime } from '../../../shared/image.ts';
import { type VoiceReplyMode, findAgentById } from '../../../shared/agents.ts';
import { type TtsModel, type TtsVoice } from '../../../shared/tts.ts';
import { type BotRef, findBotById } from '../../../shared/bots.ts';
import { activateGroup, ensureGroup, markGroupLeft } from './groups.ts';
import { loadCredential } from '../../../shared/credentials.ts';
import { t } from '../../../shared/i18n.ts';
import { getKek } from '../../../shared/kek.ts';
import { type Locale } from '../../../shared/locale.ts';
import { loadOwnerLocale } from '../../../shared/users.ts';
import {
  FreeBYOKRequiredError,
  PlatformKeyNotConfiguredError,
  resolveKey,
} from '../../../shared/keys.ts';
import {
  signMessageAudioUrl,
  uploadGeneratedAudio,
  uploadUserAudio,
} from '../../../shared/messageAudio.ts';
import { uploadUserImage } from '../../../shared/messageImages.ts';
import { DEFAULT_TEXT_MODEL, DEFAULT_VISION_MODEL } from '../../../shared/constants/models.ts';
import { tryClaimIdempotencyKey } from './dedup.ts';
import {
  deliverMessages,
  fetchMessageContent,
  LineContentError,
  LinePushError,
  LineReplyError,
  REPLY_BUDGET_MS,
  safeReply,
  showLoadingAnimation,
  type LineMessage,
} from './channels/line.ts';
import { OpenRouterError, type ChatMessage } from './openrouter.ts';
import { MAX_AGENT_STEPS, runAgentConversation } from './loop.ts';
import { COUNTER_ENV, consumeQuota } from './quota.ts';
import { deriveErrorCode, finishRun, logStep, startRun } from './runs.ts';
import { STTError, transcribeAudio } from './stt.ts';
import { synthesizeSpeech } from './tts.ts';
import {
  appendMessage,
  loadRecentMessages,
  resolveOrCreateLatestThread,
} from './threads.ts';
import { type ToolAttachment, buildToolset } from './tools/index.ts';
import { checkInjection, defaultSystemPrompt, wrapSystemPrompt } from './prompt-guard.ts';
import { normalizeReplyText } from './reply-text.ts';
import { captureException } from './sentry.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseSecretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const fermiKek = Deno.env.get('FERMI_KEK')!;

const admin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const HISTORY_WINDOW = 20;

// LINE's loading indicator lasts at most 60s per call. Re-fire a little
// before that so a multi-step run that runs long keeps showing "..." rather
// than going silent and looking broken.
const LOADING_REFRESH_MS = 50_000;

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

// The `audio` variant carries both the Whisper transcript (LLM
// consumes) and the raw bytes (storage for a future replay UI). The
// audio modality is also load-bearing for `voiceReplyMode='auto'`,
// which mirrors back voice.
type UserInput
  = | { type: 'text';  text: string }
    | { type: 'audio'; lineMessageId: string; mime: AudioMime; bytes: Uint8Array; transcript: string }
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

// Lets early-return paths (no agent / no openrouter key) surface a
// configuration notice regardless of the input modality.
const isReplyableUserMessage = (event: LineEvent): event is LineEvent & {
  replyToken: string;
  source: LineSource & { userId: string };
} => (
  isTextMessageFromUser(event)
  || isImageMessageFromUser(event)
  || isAudioMessageFromUser(event)
);

const isGroupTextMessage = (event: LineEvent): event is LineEvent & {
  replyToken: string;
  source: LineSource & { type: 'group'; groupId: string };
  message: { type: 'text'; text: string };
} => (
  event.type === 'message'
  && event.message?.type === 'text'
  && typeof event.message.text === 'string'
  && typeof event.replyToken === 'string'
  && event.source?.type === 'group'
  && typeof event.source.groupId === 'string'
);

const isGroupJoin = (event: LineEvent): event is LineEvent & {
  replyToken: string;
  source: LineSource & { type: 'group'; groupId: string };
} => (
  event.type === 'join'
  && typeof event.replyToken === 'string'
  && event.source?.type === 'group'
  && typeof event.source.groupId === 'string'
);

const isGroupLeave = (event: LineEvent): event is LineEvent & {
  source: LineSource & { type: 'group'; groupId: string };
} => (
  event.type === 'leave'
  && event.source?.type === 'group'
  && typeof event.source.groupId === 'string'
);

// Group lifecycle + the activation-code gate, independent of the agent
// loop (no LLM / key needed). Consumes group-source events and returns
// the rest for 1:1 processing. In Phase 2 an *activated* group's content
// is dropped — transcription (Phase 3) and mention chat (Phase 4) hook
// in at the marked branch.
const handleGroupEvents = async (
  incoming: LineEvent[],
  bot: BotRef,
  lineAccessToken: string,
  ownerLocale: Locale,
): Promise<LineEvent[]> => {
  const direct: LineEvent[] = [];
  for (const event of incoming) {
    if (event.source?.type !== 'group' || typeof event.source.groupId !== 'string') {
      direct.push(event);
      continue;
    }
    const groupId = event.source.groupId;

    // Leave is processed regardless of code — it's state cleanup, and a
    // no-op when no row exists.
    if (isGroupLeave(event)) {
      await markGroupLeft(admin, bot.id, groupId);
      continue;
    }

    // No activation code set → bot isn't opted into group chats. Silent:
    // no row created, nothing to activate.
    if (!bot.groupActivationCode) continue;

    if (isGroupJoin(event)) {
      await ensureGroup(admin, bot.id, groupId);
      await safeReply(lineAccessToken, event.replyToken, t('__noticeGroupJoinPrompt', ownerLocale));
      continue;
    }

    if (isGroupTextMessage(event)) {
      const group = await ensureGroup(admin, bot.id, groupId);
      if (group.status === 'activated') {
        // Phase 3 (transcription) / Phase 4 (mention chat) dispatch here.
        continue;
      }
      // Pending: only the correct code does anything; everything else is
      // silent so the group isn't spammed with re-prompts.
      if (event.message.text.trim() === bot.groupActivationCode) {
        const activated = await activateGroup(admin, bot.id, groupId);
        if (activated) {
          await safeReply(lineAccessToken, event.replyToken, t('__noticeGroupActivated', ownerLocale));
        }
      }
      continue;
    }

    // Other group events (non-text messages, memberJoined/Left, ...) drop
    // silently in Phase 2.
  }
  return direct;
};

const runAgentLoop = async (params: {
  bot: { id: string; ownerId: string };
  agent: {
    id: string;
    name: string;
    systemPrompt: string | null;
    defaultTextModel: string | null;
    defaultVisionModel: string | null;
    defaultTtsModel: TtsModel | null;
    defaultTtsVoice: TtsVoice | null;
    ttsInstructions: string | null;
    voiceReplyMode: VoiceReplyMode;
    normalizeTraditional: boolean;
  };
  ownerLocale: Locale;
  openrouterKey: string;
  lineAccessToken: string;
  kek: CryptoKey;
  externalUserId: string;
  replyToken: string;
  userInput: UserInput;
  // Webhook timestamp from LINE (ms since epoch). Anchors the
  // reply-token budget on LINE's delivery time, not worker dequeue.
  eventTimestamp: number;
}): Promise<void> => {
  const { bot, agent, ownerLocale, openrouterKey, lineAccessToken, kek, externalUserId, replyToken, userInput, eventTimestamp } = params;

  const threadId = await resolveOrCreateLatestThread(admin, bot.id, externalUserId);
  if (userInput.type === 'text') {
    await appendMessage(admin, threadId, 'user', { type: 'text', text: userInput.text });
  } else if (userInput.type === 'audio') {
    // Upload the raw bytes alongside the transcript: LLM history
    // rebuild reads the transcript (so re-loads never re-pay
    // Whisper), a future replay viewer reads the storagePath. Bytes
    // are retained for thread lifetime and prefix-deleted with the
    // rest of the thread's media when retention cleanup runs.
    const { storagePath } = await uploadUserAudio(admin, {
      ownerId: bot.ownerId,
      threadId,
      lineMessageId: userInput.lineMessageId,
      mime: userInput.mime,
      bytes: userInput.bytes,
    });
    await appendMessage(admin, threadId, 'user', {
      type: 'audio',
      mime: userInput.mime,
      sizeBytes: userInput.bytes.byteLength,
      storagePath,
      transcript: userInput.transcript,
    });
  } else {
    const { storagePath } = await uploadUserImage(admin, {
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

  // Side-effect sink for tools that produce media. Tools push entries
  // during execute; the loop tail drains them into LINE delivery.
  const attachments: ToolAttachment[] = [];

  // Keep LINE's "..." alive for the whole run — including while a single slow
  // LLM call is in flight — by re-firing on a timer, not at loop boundaries.
  // Prime now (the webhook's prime may have lapsed during cron-drain delay),
  // then refresh under LINE's 60s cap. Cleared in `finally` so it never leaks.
  void showLoadingAnimation(lineAccessToken, externalUserId)
    .catch(err => console.error('loading animation prime failed', err));
  const loadingTimer = setInterval(() => {
    void showLoadingAnimation(lineAccessToken, externalUserId)
      .catch(err => console.error('loading animation refresh failed', err));
  }, LOADING_REFRESH_MS);

  try {
    // Resolved once per run: capability attachment changes mid-loop
    // (e.g. user toggles in dashboard) shouldn't reshape the tool set
    // an LLM call already in flight believes it has.
    const attachedCapabilities = await loadActiveCapabilities(admin, agent.id);
    const toolset = await buildToolset(attachedCapabilities, { admin, kek, ownerId: bot.ownerId });

    const history = await loadRecentMessages(admin, threadId, HISTORY_WINDOW);
    const systemPrompt = wrapSystemPrompt(
      agent.systemPrompt ?? defaultSystemPrompt(agent.name),
    );
    // Any image in the history window forces a vision-capable model.
    // Without this, an agent configured with a text-only model would
    // silently 4xx the moment an image enters its conversation.
    const hasImageInHistory = history.some((m) =>
      Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url'),
    );
    // A 404 from OpenRouter on the agent's picked model (retired
    // upstream) rebinds this to the fermi default in the catch path
    // below, so subsequent loop iterations don't re-pay the same 4xx.
    // Each branch falls back to its own default with no cross-over:
    // vision → vision default, text → text default.
    const model = hasImageInHistory
      ? (agent.defaultVisionModel ?? DEFAULT_VISION_MODEL)
      : (agent.defaultTextModel ?? DEFAULT_TEXT_MODEL);
    const fallbackModel = hasImageInHistory ? DEFAULT_VISION_MODEL : DEFAULT_TEXT_MODEL;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
    ];

    let extendedRunConsumed = false;
    const conversation = await runAgentConversation({
      apiKey: openrouterKey,
      model,
      fallbackModel,
      messages,
      toolset,
      toolContextBase: { admin, kek, ownerId: bot.ownerId, threadId, runId, attachments },
      maxSteps: MAX_AGENT_STEPS,
      onStep: s => logStep(admin, {
        runId,
        step:            step++,
        type:            s.type,
        payload:         s.payload,
        latencyMs:       s.latencyMs,
        costUsd:         s.costUsd,
        openrouterGenId: s.openrouterGenId,
      }),
      // extended_run quota: INCR at most once per run, the first time
      // wall time crosses the reply-token budget. Aborting ends the loop
      // with a CTA; already-paid LLM cost up to that point is sunk.
      beforeIteration: async () => {
        if (extendedRunConsumed || (Date.now() - eventTimestamp) < REPLY_BUDGET_MS) return null;
        const exQuota = await consumeQuota(admin, COUNTER_ENV, {
          ownerId: bot.ownerId,
          purpose: 'extended_run',
        });
        extendedRunConsumed = true;
        return exQuota.allowed
          ? null
          : { abort: true, text: t('__noticeQuotaExtendedRunExhausted', ownerLocale) };
      },
    });
    totalCostUsd += conversation.totalCostUsd;
    let finalText: string | null = conversation.hitStepCap ? null : conversation.text;

    // Hit the step cap without a terminal assistant turn. Send the
    // user a clear "I stopped" notice rather than nothing.
    if (finalText === null) {
      finalText = t('__noticeAgentStepsExceeded', ownerLocale, { steps: MAX_AGENT_STEPS });
    }

    const injectionCheck = checkInjection(finalText);
    if (injectionCheck.detected) {
      console.warn('prompt injection signal in LLM output', {
        runId,
        ownerId: bot.ownerId,
        pattern: injectionCheck.pattern,
      });
    }

    // Single conversion point: TTS, the persisted transcript, history,
    // and the outbound LINE text all derive from finalText, so converting
    // here keeps every channel consistent — and before the fermi-authored
    // suffix (already plain Traditional) is appended below. The same pass
    // runs in agent-invoke so the dashboard test chat previews this text.
    finalText = normalizeReplyText(finalText, { traditional: agent.normalizeTraditional });

    // Voice-reply mode resolves to a yes/no per-turn:
    //   always → every turn
    //   auto   → only when this turn's user input was audio (mirror)
    //   off    → never
    // Any failure along the TTS path (Free without OpenAI BYOK,
    // platform env unset, OpenAI 4xx/5xx, upload error) falls back to
    // text. Better a text reply than no reply.
    const wantsVoiceReply
      = agent.voiceReplyMode === 'always'
        || (agent.voiceReplyMode === 'auto' && userInput.type === 'audio');

    // Synthesize TTS before persisting: the `messages` row shape depends
    // on the outcome — an audio variant (with transcript) vs plain text.
    // Mirrors the user-side STT shape: one audio row, transcript embedded.
    let ttsAudio: { storagePath: string; signedUrl: string; mime: string; sizeBytes: number; durationMs: number } | null = null;
    // Distinguishes quota block (suffix CTA on text fallback) from
    // generic TTS failure (silent text fallback). Both end up as text;
    // only the quota path warrants the user-facing CTA.
    let ttsQuotaExhausted = false;
    if (wantsVoiceReply) {
      const ttsQuota = await consumeQuota(admin, COUNTER_ENV, {
        ownerId: bot.ownerId,
        purpose: 'tts',
      });
      if (!ttsQuota.allowed) {
        ttsQuotaExhausted = true;
      } else {
        try {
          const resolved = await resolveKey(admin, kek, {
            ownerId: bot.ownerId,
            purpose: 'openai',
            platformKey: PLATFORM_OPENAI_KEY,
          });
          const speech = await synthesizeSpeech({
            apiKey:       resolved.key,
            text:         finalText,
            model:        agent.defaultTtsModel,
            voice:        agent.defaultTtsVoice,
            instructions: agent.ttsInstructions,
          });
          const { storagePath } = await uploadGeneratedAudio(admin, {
            ownerId: bot.ownerId,
            threadId,
            runId,
            mime: speech.mime,
            bytes: speech.bytes,
          });
          const signedUrl = await signMessageAudioUrl(admin, storagePath);
          ttsAudio = {
            storagePath,
            signedUrl,
            mime: speech.mime,
            sizeBytes: speech.bytes.byteLength,
            durationMs: speech.durationMs,
          };
        } catch (ttsErr) {
          console.warn('TTS failed; falling back to text', {
            agentId: agent.id,
            ownerId: bot.ownerId,
            err: String(ttsErr),
          });
        }
      }
    }

    // Audio rows embed the transcript, mirroring the user-side STT
    // shape so history rebuild treats both ends symmetrically.
    if (ttsAudio) {
      await appendMessage(admin, threadId, 'assistant', {
        type: 'audio',
        mime: ttsAudio.mime,
        sizeBytes: ttsAudio.sizeBytes,
        storagePath: ttsAudio.storagePath,
        transcript: finalText,
      });
    } else {
      await appendMessage(admin, threadId, 'assistant', { type: 'text', text: finalText });
    }

    // Tool media persists as separate assistant rows so later history
    // rebuilds can re-sign the URLs.
    for (const att of attachments) {
      if (att.type === 'image') {
        await appendMessage(admin, threadId, 'assistant', {
          type: 'image',
          mime: att.mime,
          sizeBytes: att.sizeBytes,
          storagePath: att.storagePath,
        });
      }
    }

    // LINE caps multi-message replies at 5; image attachments take the
    // slots after the primary, so a turn that produces 5+ images loses
    // the tail. The truncation layer (replyMessages / pushMessages)
    // caps at LINE_MESSAGES_PER_CALL regardless.
    const textWithSuffix = ttsQuotaExhausted
      ? `${finalText}${t('__noticeQuotaTtsExhaustedSuffix', ownerLocale)}`
      : finalText;
    const outbound: LineMessage[] = ttsAudio
      ? [{ type: 'audio', originalContentUrl: ttsAudio.signedUrl, duration: ttsAudio.durationMs }]
      : [{ type: 'text', text: textWithSuffix }];
    for (const att of attachments) {
      if (att.type === 'image') {
        outbound.push({
          type: 'image',
          originalContentUrl: att.originalContentUrl,
          previewImageUrl: att.previewImageUrl,
        });
      }
    }

    const elapsedMs = Date.now() - eventTimestamp;
    try {
      const method = await deliverMessages({
        accessToken: lineAccessToken,
        replyToken,
        userId: externalUserId,
        messages: outbound,
        elapsedMs,
      });
      // Observe-only: count successful pushes toward the LINE-side
      // monthly cap so dashboard /usage can surface usage. Doesn't
      // block — push is what gets the reply to the user and dropping
      // it harms UX more than enforcing a cap helps. Fail-open: a
      // counter outage here must not error the run that already
      // delivered successfully.
      if (method === 'push') {
        await consumeQuota(admin, COUNTER_ENV, {
          ownerId: bot.ownerId,
          purpose: 'line_push',
        }).catch((quotaErr) => console.error('line_push quota INCR failed', quotaErr));
      }
      await logStep(admin, {
        runId,
        step: step++,
        type: 'push_succeeded',
        payload: { method, elapsed_ms: elapsedMs },
      });
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
      await finishRun(admin, runId, 'failed', totalCostUsd, deriveErrorCode(pushStatus));
      // Both Reply 400 (fallback to Push already tried) and Push 4xx
      // are terminal for this event. Retrying via pgmq would just
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
    // Surface the failure to LINE so the user sees what went wrong
    // instead of staring at a vanished `...`.
    let userNotified = false;
    try {
      await deliverMessages({
        accessToken: lineAccessToken,
        replyToken,
        userId: externalUserId,
        messages: [{ type: 'text', text: t('__noticeServiceError', ownerLocale) }],
        elapsedMs: Date.now() - eventTimestamp,
      });
      userNotified = true;
    } catch (notifyErr) {
      console.error('error notice delivery failed', notifyErr);
    }
    await finishRun(admin, runId, 'failed', totalCostUsd, deriveErrorCode(errStatus));
    // Retry semantics flip on whether the user saw the error: once
    // notified, throwing would have pgmq redeliver and spam the chat
    // with a duplicate ⚠️ every visibility-timeout (~30s). If notice
    // itself failed (LINE 5xx), keep the throw so pgmq can retry
    // (maybe the next attempt lands while LINE is back up).
    if (userNotified) return;
    throw err;
  } finally {
    clearInterval(loadingTimer);
  }
};

// Filters out events whose webhookEventId is already processed
// (pgmq re-delivery, LINE webhook retry). Events without a
// webhookEventId fall through unguarded (defensive only, LINE has
// set this field on every webhook event since 2021).
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
  const allEvents = await claimFreshEvents(payload.events ?? []);
  if (allEvents.length === 0) return;

  const bot = await findBotById(admin, payload.botId);
  if (!bot) {
    // Bot was deleted or disabled between enqueue and dequeue. Either
    // way the right move is to drop the queued event silently.
    console.warn('bot inactive; dropping message', { botId: payload.botId });
    return;
  }

  const ownerLocale = await loadOwnerLocale(admin, bot.ownerId);

  const kek = await getKek(fermiKek);
  const { plaintext: lineAccessToken } = await loadCredential(admin, kek, {
    userId: bot.ownerId,
    botId: bot.id,
    keyType: 'line_channel_access_token',
  });

  // Group lifecycle + activation run independently of the agent loop;
  // they consume group events and return the rest for 1:1 processing.
  const events = await handleGroupEvents(allEvents, bot, lineAccessToken, ownerLocale);
  if (events.length === 0) return;

  // Bot has no agent bound, or the binding was cleared (agent soft-
  // deleted). Reply with an actionable message instead of silence.
  if (!bot.agentId) {
    for (const event of events) {
      if (isReplyableUserMessage(event)) {
        await safeReply(lineAccessToken, event.replyToken, t('__noticeNoAgent', ownerLocale));
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
        await safeReply(lineAccessToken, event.replyToken, t('__noticeNoAgent', ownerLocale));
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
    // PlatformKeyNotConfiguredError = Pro user but fermi's env is
    // missing (operational issue on the fermi side; user-facing
    // message must not blame the user). Any other throw is a real
    // DB/decryption error → bubble so pgmq retries.
    const noticeKey = err instanceof FreeBYOKRequiredError
      ? '__noticeFreeByokOpenrouter'
      : err instanceof PlatformKeyNotConfiguredError
        ? '__noticePlatformKeyOps'
        : null;
    if (noticeKey === null) throw err;
    if (err instanceof PlatformKeyNotConfiguredError) {
      console.error('platform OpenRouter key missing for Pro user', { ownerId: bot.ownerId });
    }
    for (const event of events) {
      if (isReplyableUserMessage(event)) {
        await safeReply(lineAccessToken, event.replyToken, t(noticeKey, ownerLocale));
      }
    }
    return;
  }

  for (const event of events) {
    // LINE always sets `timestamp` on webhook events. The fallback
    // covers malformed payloads only; assuming "just arrived" keeps
    // the call on Reply, and a 400 still falls back to Push internally.
    const eventTimestamp = typeof event.timestamp === 'number' ? event.timestamp : Date.now();

    if (isTextMessageFromUser(event)) {
      await runAgentLoop({
        bot,
        agent,
        ownerLocale,
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
      let imageMime: ImageMime;
      try {
        const content = await fetchMessageContent(lineAccessToken, event.message.id);
        const detected = detectImageMime(content.bytes);
        if (!detected) {
          await safeReply(lineAccessToken, event.replyToken, t('__noticeUnsupportedImageFormat', ownerLocale));
          continue;
        }
        imageMime = detected;
        imageBytes = content.bytes;
      } catch (err) {
        if (err instanceof LineContentError && err.status === 413) {
          await safeReply(lineAccessToken, event.replyToken, t('__noticeImageTooLarge', ownerLocale));
          continue;
        }
        throw err;
      }
      await runAgentLoop({
        bot,
        agent,
        ownerLocale,
        openrouterKey,
        lineAccessToken,
        kek,
        externalUserId: event.source.userId,
        replyToken: event.replyToken,
        userInput: { type: 'image', lineMessageId: event.message.id, mime: imageMime, bytes: imageBytes },
        eventTimestamp,
      });
      continue;
    }

    if (isAudioMessageFromUser(event)) {
      let audioBytes: Uint8Array;
      let audioMime: AudioMime;
      try {
        const content = await fetchMessageContent(lineAccessToken, event.message.id);
        const detected = detectAudioMime(content.bytes);
        if (!detected) {
          await safeReply(lineAccessToken, event.replyToken, t('__noticeUnsupportedAudioFormat', ownerLocale));
          continue;
        }
        audioMime = detected;
        audioBytes = content.bytes;
      } catch (err) {
        if (err instanceof LineContentError && err.status === 413) {
          await safeReply(lineAccessToken, event.replyToken, t('__noticeAudioTooLarge', ownerLocale));
          continue;
        }
        throw err;
      }

      // Quota gate before resolving the OpenAI key: cheap fast-fail
      // and stops a quota-exhausted user from being told "set up your
      // key" when the real issue is the cap.
      const sttQuota = await consumeQuota(admin, COUNTER_ENV, {
        ownerId: bot.ownerId,
        purpose: 'stt',
      });
      if (!sttQuota.allowed) {
        await safeReply(lineAccessToken, event.replyToken, t('__noticeQuotaSttExhausted', ownerLocale));
        continue;
      }

      // STT runs *before* the agent loop because the rest of the
      // pipeline only knows text + image. Whisper turns audio into
      // text, then the loop proceeds exactly like a typed message.
      // Errors here short-circuit with a user-facing notice. No
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
          await safeReply(lineAccessToken, event.replyToken, t('__noticeFreeByokOpenai', ownerLocale));
          continue;
        }
        if (err instanceof PlatformKeyNotConfiguredError) {
          console.error('platform OpenAI key missing for Pro user', { ownerId: bot.ownerId });
          await safeReply(lineAccessToken, event.replyToken, t('__noticePlatformKeyOps', ownerLocale));
          continue;
        }
        throw err;
      }

      let transcript: string;
      try {
        transcript = await transcribeAudio({ apiKey: openaiKey, bytes: audioBytes, mime: audioMime });
      } catch (err) {
        if (err instanceof STTError) {
          console.warn('Whisper failed; dropping audio', { status: err.status });
          await safeReply(lineAccessToken, event.replyToken, t('__noticeAudioTranscriptionFailed', ownerLocale));
          continue;
        }
        throw err;
      }
      if (transcript.length === 0) {
        await safeReply(lineAccessToken, event.replyToken, t('__noticeAudioEmpty', ownerLocale));
        continue;
      }

      // `audio` variant retains modality + raw bytes so runAgentLoop
      // can (a) prefix `[audio]` in messages history for the LLM,
      // (b) persist bytes to storage for future replay viewer, and
      // (c) honor voiceReplyMode='auto' (mirror back voice).
      await runAgentLoop({
        bot,
        agent,
        ownerLocale,
        openrouterKey,
        lineAccessToken,
        kek,
        externalUserId: event.source.userId,
        replyToken: event.replyToken,
        userInput: {
          type: 'audio',
          lineMessageId: event.message.id,
          mime: audioMime,
          bytes: audioBytes,
          transcript,
        },
        eventTimestamp,
      });
      continue;
    }

    // Unsupported message subtypes (sticker / video / file / location /
    // imagemap) get one scope-notice reply. Non-message events (follow /
    // unfollow / postback / ...) drop silently — they have no replyToken
    // to address.
    if (
      event.type === 'message'
      && typeof event.replyToken === 'string'
      && event.source?.type === 'user'
    ) {
      await safeReply(
        lineAccessToken,
        event.replyToken,
        t('__noticeUnsupportedMessageType', ownerLocale),
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
    void captureException(error, { tags: { stage: 'dequeue' } });
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
        void captureException(archiveErr, { tags: { stage: 'archive' }, extra: { msg_id } });
      }
    } catch (err) {
      console.error('process failed; leaving for retry', { msg_id, err });
      void captureException(err, { tags: { stage: 'process' }, extra: { msg_id } });
    }
  }

  return new Response(JSON.stringify({ processed: messages.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
