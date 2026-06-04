import { createClient } from '@supabase/supabase-js';
import { loadActiveCapabilities } from '../../../shared/agentCapabilities.ts';
import { type AudioMime, detectAudioMime } from '../../../shared/audio.ts';
import { detectImageMime, type ImageMime } from '../../../shared/image.ts';
import { type VoiceReplyMode, findAgentById } from '../../../shared/agents.ts';
import { type TtsModel, type TtsVoice } from '../../../shared/tts.ts';
import { type BotRef, findBotById } from '../../../shared/bots.ts';
import { activateGroup, ensureGroup, markGroupLeft } from './groups.ts';
import { resolveDisplayName } from './groupMembers.ts';
import { loadCredential } from '../../../shared/credentials.ts';
import { t } from '../../../shared/i18n.ts';
import { getKek } from '../../../shared/kek.ts';
import { type Locale } from '../../../shared/locale.ts';
import { loadOwnerContext } from '../../../shared/users.ts';
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
  pushMessages,
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
  type ThreadSubjectType,
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

// Appended to the agent's system prompt when replying in a group. The
// history feeds `[name] ...`-prefixed turns; this tells the model how to
// read them and to answer only the mention that summoned it.
const GROUP_CONTEXT_PROMPT = '\n\nYou are in a LINE group chat with multiple people. Each user message is prefixed with the speaker\'s name in brackets, e.g. "[Alice] ...". You are only brought in when someone @-mentions you, so answer the message that mentioned you, stay brief, and don\'t address people who didn\'t ask you anything. Never prefix your own reply with a name.';

// Builds the `[Context]` line prepended to every system prompt: current
// UTC instant plus the same instant rendered in the owner's timezone, so
// the LLM can resolve relative reminder times without ambiguity. A bad
// stored timezone (Intl throws) degrades to UTC-only rather than failing
// the run.
const formatTimeContext = (timezone: string): string => {
  const now = new Date();
  let local: string;
  try {
    local = new Intl.DateTimeFormat('en-CA', {
      timeZone:     timezone,
      year:         'numeric',
      month:        '2-digit',
      day:          '2-digit',
      hour:         '2-digit',
      minute:       '2-digit',
      hour12:       false,
      timeZoneName: 'short',
    }).format(now);
  } catch {
    return `[Context] Current time: ${now.toISOString()} (UTC). User timezone unknown; treat times as UTC.`;
  }
  return `[Context] Current time: ${now.toISOString()} (UTC) = ${local} in ${timezone}. Resolve relative times against the user's timezone.`;
};

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
  message?: { type: string; id?: string; text?: string; mention?: { mentionees?: { isSelf?: boolean }[] } };
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
  message: { type: 'text'; text: string; mention?: { mentionees?: { isSelf?: boolean }[] } };
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

const isGroupAudioMessage = (event: LineEvent): event is LineEvent & {
  replyToken: string;
  source: LineSource & { type: 'group'; groupId: string; userId: string };
  message: { type: 'audio'; id: string };
} => (
  event.type === 'message'
  && event.message?.type === 'audio'
  && typeof event.message.id === 'string'
  && typeof event.replyToken === 'string'
  && event.source?.type === 'group'
  && typeof event.source.groupId === 'string'
  && typeof event.source.userId === 'string'
);

interface GroupMention {
  groupId:        string;
  senderId:       string;
  text:           string;
  replyToken:     string;
  eventTimestamp: number;
}

// Persists a group message into the group's thread for @mention context,
// attributed to its sender. Plain chatter is stored but not replied to; a
// later @mention reads it back as history.
const storeGroupContext = async (
  botId: string,
  groupId: string,
  senderId: string,
  text: string,
): Promise<void> => {
  const threadId = await resolveOrCreateLatestThread(admin, botId, groupId, 'group');
  await appendMessage(admin, threadId, 'user', { type: 'text', text }, senderId);
};

// Transcribes one voice message in an activated group and relays it as
// `🎤 name：text`. Pure relay — no LLM, no agent loop. Best-effort and
// silent on every failure (bad format, oversize, quota, missing key,
// Whisper error): a group must not be spammed with error notices for one
// member's clip, so failures only log.
const transcribeGroupAudio = async (params: {
  bot: BotRef;
  kek: CryptoKey;
  lineAccessToken: string;
  ownerLocale: Locale;
  groupId: string;
  userId: string;
  messageId: string;
  replyToken: string;
}): Promise<void> => {
  const { bot, kek, lineAccessToken, ownerLocale, groupId, userId, messageId, replyToken } = params;

  // Failures surface the same notices as the 1:1 audio path. A silent drop
  // in a group leaves the owner no way to tell why nothing transcribed
  // (a missing OpenAI key being the common one) — debuggability wins over
  // the speculative concern of one extra message in the group.
  let bytes: Uint8Array;
  let mime: AudioMime;
  try {
    const content = await fetchMessageContent(lineAccessToken, messageId);
    const detected = detectAudioMime(content.bytes);
    if (!detected) {
      await safeReply(lineAccessToken, replyToken, t('__noticeUnsupportedAudioFormat', ownerLocale));
      return;
    }
    mime = detected;
    bytes = content.bytes;
  } catch (err) {
    if (err instanceof LineContentError && err.status === 413) {
      await safeReply(lineAccessToken, replyToken, t('__noticeAudioTooLarge', ownerLocale));
      return;
    }
    throw err;
  }

  let openaiKey: string;
  try {
    const resolved = await resolveKey(admin, kek, {
      ownerId:     bot.ownerId,
      purpose:     'openai',
      platformKey: PLATFORM_OPENAI_KEY,
    });
    openaiKey = resolved.key;
  } catch (err) {
    if (err instanceof FreeBYOKRequiredError) {
      await safeReply(lineAccessToken, replyToken, t('__noticeFreeByokOpenai', ownerLocale));
      return;
    }
    if (err instanceof PlatformKeyNotConfiguredError) {
      console.error('platform OpenAI key missing for Pro user', { ownerId: bot.ownerId });
      await safeReply(lineAccessToken, replyToken, t('__noticePlatformKeyOps', ownerLocale));
      return;
    }
    throw err;
  }

  const quota = await consumeQuota(admin, COUNTER_ENV, { ownerId: bot.ownerId, purpose: 'stt' });
  if (!quota.allowed) {
    await safeReply(lineAccessToken, replyToken, t('__noticeQuotaSttExhausted', ownerLocale));
    return;
  }

  let transcript: string;
  try {
    transcript = await transcribeAudio({ apiKey: openaiKey, bytes, mime });
  } catch (err) {
    if (err instanceof STTError) {
      await safeReply(lineAccessToken, replyToken, t('__noticeAudioTranscriptionFailed', ownerLocale));
      return;
    }
    throw err;
  }
  if (transcript.length === 0) {
    await safeReply(lineAccessToken, replyToken, t('__noticeAudioEmpty', ownerLocale));
    return;
  }

  const name = await resolveDisplayName(admin, lineAccessToken, bot.id, groupId, userId);
  await safeReply(lineAccessToken, replyToken, `🎤 ${name}：${transcript}`);
  // The transcript also joins the group's thread so a later @mention has
  // the spoken context, per the "voice transcripts enter context" rule.
  await storeGroupContext(bot.id, groupId, userId, transcript);
};

// Group lifecycle + the activation-code gate, independent of the agent
// loop. Consumes group-source events and returns the rest for 1:1
// processing. Activated groups transcribe voice (the relay feature);
// activated text is Phase 4 (mention chat).
const handleGroupEvents = async (
  incoming: LineEvent[],
  bot: BotRef,
  kek: CryptoKey,
  lineAccessToken: string,
  ownerLocale: Locale,
): Promise<{ directEvents: LineEvent[]; groupMentions: GroupMention[] }> => {
  const direct: LineEvent[] = [];
  const groupMentions: GroupMention[] = [];
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

    // Group messages: ensure the row exists, then branch on status.
    if (event.type === 'message' && typeof event.replyToken === 'string') {
      const group = await ensureGroup(admin, bot.id, groupId);
      if (group.status !== 'activated') {
        // Pending: only the correct activation code (a text message) does
        // anything; everything else is silent so the group isn't spammed.
        if (isGroupTextMessage(event) && event.message.text.trim() === bot.groupActivationCode) {
          if (await activateGroup(admin, bot.id, groupId)) {
            await safeReply(lineAccessToken, event.replyToken, t('__noticeGroupActivated', ownerLocale));
          }
        }
        continue;
      }
      // Activated. Voice → transcription relay. Text → stored for context;
      // an @mention also queues an agent reply, run after key resolution.
      if (isGroupAudioMessage(event) && bot.groupTranscribeEnabled) {
        await transcribeGroupAudio({
          bot,
          kek,
          lineAccessToken,
          ownerLocale,
          groupId,
          userId:     event.source.userId,
          messageId:  event.message.id,
          replyToken: event.replyToken,
        });
      } else if (isGroupTextMessage(event) && typeof event.source.userId === 'string') {
        const senderId = event.source.userId;
        const mentioned = event.message.mention?.mentionees?.some(m => m.isSelf) ?? false;
        if (mentioned && bot.groupMentionEnabled) {
          groupMentions.push({
            groupId,
            senderId,
            text:           event.message.text,
            replyToken:     event.replyToken,
            eventTimestamp: typeof event.timestamp === 'number' ? event.timestamp : Date.now(),
          });
        } else {
          await storeGroupContext(bot.id, groupId, senderId, event.message.text);
        }
      }
      continue;
    }

    // Other group events (memberJoined / memberLeft / ...) drop silently.
  }
  return { directEvents: direct, groupMentions };
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
  ownerTimezone: string;
  openrouterKey: string;
  lineAccessToken: string;
  kek: CryptoKey;
  externalUserId: string;
  replyToken: string;
  userInput: UserInput;
  // Webhook timestamp from LINE (ms since epoch). Anchors the
  // reply-token budget on LINE's delivery time, not worker dequeue.
  eventTimestamp: number;
  // Set when this turn is a group @mention: switches the thread to the
  // group, attributes the sender, appends group rules, and delivers back
  // to the group. `externalUserId` is then the mentioner.
  group?: { groupId: string };
}): Promise<void> => {
  const { bot, agent, ownerLocale, ownerTimezone, openrouterKey, lineAccessToken, kek, externalUserId, replyToken, userInput, eventTimestamp, group } = params;

  const subjectExternalId = group ? group.groupId : externalUserId;
  const subjectType: ThreadSubjectType = group ? 'group' : 'user';
  // 1:1 delivers / shows loading to the user; group delivers to the group.
  const deliverTo = group ? group.groupId : externalUserId;

  const threadId = await resolveOrCreateLatestThread(admin, bot.id, subjectExternalId, subjectType);
  if (userInput.type === 'text') {
    await appendMessage(admin, threadId, 'user', { type: 'text', text: userInput.text }, externalUserId);
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
    }, externalUserId);
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
    }, externalUserId);
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
  // LINE's loading indicator only works in 1:1 chats, not groups.
  let loadingTimer: ReturnType<typeof setInterval> | null = null;
  if (!group) {
    void showLoadingAnimation(lineAccessToken, externalUserId)
      .catch(err => console.error('loading animation prime failed', err));
    loadingTimer = setInterval(() => {
      void showLoadingAnimation(lineAccessToken, externalUserId)
        .catch(err => console.error('loading animation refresh failed', err));
    }, LOADING_REFRESH_MS);
  }

  try {
    // Resolved once per run: capability attachment changes mid-loop
    // (e.g. user toggles in dashboard) shouldn't reshape the tool set
    // an LLM call already in flight believes it has.
    const attachedCapabilities = await loadActiveCapabilities(admin, agent.id);
    const toolset = await buildToolset(attachedCapabilities, { admin, kek, ownerId: bot.ownerId });

    const history = await loadRecentMessages(
      admin,
      threadId,
      HISTORY_WINDOW,
      group ? { accessToken: lineAccessToken, botId: bot.id, groupId: group.groupId } : undefined,
    );
    // Inject current time + the owner's timezone so the LLM can resolve
    // relative times ("tomorrow 9am") for the reminder tools. In a group,
    // also append the group rules. Both are trusted fermi text, so they
    // live inside the wrap alongside the agent's own prompt.
    const systemPrompt = wrapSystemPrompt(
      `${formatTimeContext(ownerTimezone)}\n\n${agent.systemPrompt ?? defaultSystemPrompt(agent.name)}${group ? GROUP_CONTEXT_PROMPT : ''}`,
      { hasTools: attachedCapabilities.length > 0 },
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
      toolContextBase: { admin, kek, ownerId: bot.ownerId, agentId: agent.id, threadId, botId: bot.id, externalUserId, runId, attachments },
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
        userId: deliverTo,
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
        userId: deliverTo,
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
    if (loadingTimer) clearInterval(loadingTimer);
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

  const { locale: ownerLocale, timezone: ownerTimezone } = await loadOwnerContext(admin, bot.ownerId);

  const kek = await getKek(fermiKek);
  const { plaintext: lineAccessToken } = await loadCredential(admin, kek, {
    userId: bot.ownerId,
    botId: bot.id,
    keyType: 'line_channel_access_token',
  });

  // Group lifecycle / activation / transcription run independently of the
  // agent loop. Returns 1:1 events for the loop below, plus the group
  // @mentions that do need the loop (handled after agent + key resolve).
  const { directEvents: events, groupMentions } = await handleGroupEvents(allEvents, bot, kek, lineAccessToken, ownerLocale);
  if (events.length === 0 && groupMentions.length === 0) return;

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
        ownerTimezone,
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
        ownerTimezone,
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
        ownerTimezone,
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

  // Group @mentions need the agent + OpenRouter key, so they run after the
  // 1:1 resolution above (and are silently skipped if it early-returned).
  for (const gm of groupMentions) {
    await runAgentLoop({
      bot,
      agent,
      ownerLocale,
      ownerTimezone,
      openrouterKey,
      lineAccessToken,
      kek,
      externalUserId: gm.senderId,
      replyToken:     gm.replyToken,
      userInput:      { type: 'text', text: gm.text },
      eventTimestamp: gm.eventTimestamp,
      group:          { groupId: gm.groupId },
    });
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

// ---- Reminder fire dispatch (reminder_events queue) ------------------------

interface ReminderFirePayload {
  reminder_id: string;
}

interface ReminderQueueMessage {
  msg_id:  number;
  payload: ReminderFirePayload;
}

const markReminderFailed = async (reminderId: string, reason: string): Promise<void> => {
  const { error: failErr } = await admin
    .from('reminders')
    .update({ status: 'failed', failure_reason: reason })
    .eq('id', reminderId);
  if (failErr) console.error('reminder mark-failed failed', { reminderId, failErr });
};

// Releases a claimed fire back to pending so a later cron tick retries it.
// Only for transient delivery failures (LINE 5xx / network).
const releaseReminder = async (reminderId: string): Promise<void> => {
  const { error: releaseErr } = await admin
    .from('reminders')
    .update({ status: 'pending', fired_at: null })
    .eq('id', reminderId)
    .eq('status', 'fired');
  if (releaseErr) console.error('reminder release failed', { reminderId, releaseErr });
};

const processReminderFire = async (payload: ReminderFirePayload): Promise<void> => {
  // CAS claim: flip pending→fired and only proceed if this call won the
  // flip. A pgmq redelivery or a duplicate cron enqueue finds the row
  // already fired (or cancelled) and no-ops — this is the idempotency
  // guard that keeps a reminder from double-firing.
  const { data: claimed, error: claimErr } = await admin
    .from('reminders')
    .update({ status: 'fired', fired_at: new Date().toISOString() })
    .eq('id', payload.reminder_id)
    .eq('status', 'pending')
    .select('id, owner_id, bot_id, thread_id, external_user_id, message')
    .maybeSingle();
  if (claimErr) throw claimErr;
  if (!claimed) return;

  const bot = await findBotById(admin, claimed.bot_id);
  if (!bot || !bot.agentId) {
    // Bot disabled / deleted between scheduling and firing. No live
    // transport to push through; permanent failure.
    await markReminderFailed(claimed.id, 'bot_inactive');
    return;
  }

  const kek = await getKek(fermiKek);
  let lineAccessToken: string;
  try {
    const { plaintext } = await loadCredential(admin, kek, {
      userId:  claimed.owner_id,
      botId:   claimed.bot_id,
      keyType: 'line_channel_access_token',
    });
    lineAccessToken = plaintext;
  } catch (err) {
    // Credential gone (bot disconnected). No token to retry with.
    console.warn('reminder fire: LINE token missing', { reminderId: claimed.id, err: String(err) });
    await markReminderFailed(claimed.id, 'credential_missing');
    return;
  }

  const text = `🔔 ${claimed.message}`;

  // A reminder fire has no LLM loop; the run + single push step exist so
  // the admin timeline shows it alongside conversational runs.
  const runId = await startRun(admin, {
    threadId: claimed.thread_id,
    botId:    claimed.bot_id,
    agentId:  bot.agentId,
    ownerId:  claimed.owner_id,
  });
  try {
    await pushMessages(lineAccessToken, claimed.external_user_id, [{ type: 'text', text }]);
    // Persist into the thread only after a successful push, so a
    // transient-retry doesn't leave duplicate 🔔 rows in history.
    await appendMessage(admin, claimed.thread_id, 'assistant', { type: 'text', text });
    await consumeQuota(admin, COUNTER_ENV, {
      ownerId: claimed.owner_id,
      purpose: 'line_push',
    }).catch((quotaErr) => console.error('line_push quota INCR failed', quotaErr));
    await logStep(admin, {
      runId,
      step: 1,
      type: 'push_succeeded',
      payload: { method: 'push', reminder_id: claimed.id },
    });
    await finishRun(admin, runId, 'succeeded', 0);
  } catch (err) {
    const pushStatus = err instanceof LinePushError ? err.status : undefined;
    await logStep(admin, {
      runId,
      step: 1,
      type: 'push_failed',
      payload: { reminder_id: claimed.id, message: String(err), status: pushStatus },
    });
    await finishRun(admin, runId, 'failed', 0, deriveErrorCode(pushStatus));
    // 4xx = permanent (revoked token / blocked user): mark failed.
    // Anything else (5xx / network) is transient: release the claim so a
    // later cron tick retries.
    if (pushStatus !== undefined && pushStatus >= 400 && pushStatus < 500) {
      await markReminderFailed(claimed.id, `line_${pushStatus}`);
    } else {
      await releaseReminder(claimed.id);
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

  // Drain due reminder fires from their own queue in the same
  // invocation. Independent of the webhook queue: a reminder is not a
  // webhook, and keeping the two separate leaves the conversational
  // path untouched.
  const { data: reminderData, error: reminderErr } = await admin.rpc('dequeue_reminder_events', {
    batch_size: 10,
    visibility_timeout: 60,
  });
  if (reminderErr) {
    console.error('reminder dequeue failed', reminderErr);
    void captureException(reminderErr, { tags: { stage: 'reminder_dequeue' } });
  }
  const reminders = (reminderData ?? []) as ReminderQueueMessage[];
  for (const { msg_id, payload } of reminders) {
    try {
      await processReminderFire(payload);
      const { error: archiveErr } = await admin.rpc('archive_reminder_event', { msg_id });
      if (archiveErr) {
        console.error('reminder archive failed', { msg_id, archiveErr });
        void captureException(archiveErr, { tags: { stage: 'reminder_archive' }, extra: { msg_id } });
      }
    } catch (err) {
      console.error('reminder fire failed; leaving for retry', { msg_id, err });
      void captureException(err, { tags: { stage: 'reminder_fire' }, extra: { msg_id } });
    }
  }

  return new Response(
    JSON.stringify({ processed: messages.length, reminders: reminders.length }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
