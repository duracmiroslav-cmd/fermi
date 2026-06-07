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
import { loadRecentMemories, MEMORY_INJECT_LIMIT } from '../../../shared/memories.ts';
import {
  FreeByokRequiredError,
  type KeySource,
  PlatformKeyNotConfiguredError,
  resolveKey,
} from '../../../shared/keys.ts';
import {
  signMessageAudioUrl,
  uploadGeneratedAudio,
  uploadUserAudio,
} from '../../../shared/messageAudio.ts';
import { uploadUserImage } from '../../../shared/messageImages.ts';
import {
  UnsupportedFileError,
  extractDocumentText,
  isSupportedDocumentFilename,
} from '../../../shared/documentText.ts';
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
  type LineQuickReply,
} from './channels/line.ts';
import { OpenRouterError, type ChatMessage } from './openrouter.ts';
import { MAX_AGENT_STEPS, runAgentConversation } from './loop.ts';
import { COUNTER_ENV, consumeQuota, peekQuota } from './quota.ts';
import { checkGroupMemberRateLimit } from './groupRateLimit.ts';
import { deriveErrorCode, finishRun, logStep, startRun } from './runs.ts';
import { STTError, transcribeAudio } from './stt.ts';
import { synthesizeSpeech } from './tts.ts';
import {
  appendMessage,
  loadRecentMessages,
  resolveOrCreateLatestThread,
  softDeleteLatestThreads,
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

// Inline file read carries the document's full extracted text in thread history
// every turn it stays in the window, so cap it well below the knowledge base's
// 200k ingestion limit. ~30k chars ≈ 20–30 pages / a few×10k tokens per turn;
// larger documents are routed to the knowledge base (RAG), which is built for
// them, rather than bloating every turn here.
const INLINE_DOCUMENT_MAX_CHARS = 30_000;

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
  message?: { type: string; id?: string; text?: string; fileName?: string; fileSize?: number; keywords?: string[]; title?: string; address?: string; latitude?: number; longitude?: number; mention?: { mentionees?: { isSelf?: boolean }[] } };
  postback?: { data?: string };
  webhookEventId?: string;
}

// The `audio` variant carries both the Whisper transcript (LLM
// consumes) and the raw bytes (storage for a future replay UI). The
// audio modality is also load-bearing for `voiceReplyMode='auto'`,
// which mirrors back voice.
type UserInput
  = | { type: 'text';  text: string }
    | { type: 'audio'; lineMessageId: string; mime: AudioMime; bytes: Uint8Array; transcript: string }
    | { type: 'image'; lineMessageId: string; mime: ImageMime; bytes: Uint8Array }
    | { type: 'document'; lineMessageId: string; filename: string; text: string }
    | { type: 'sticker'; keywords: string[]; text?: string }
    | { type: 'location'; title?: string; address?: string; latitude: number; longitude: number };

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

// LINE 'file' messages carry the original filename (extension drives which
// extractor runs) and an id to pull the bytes from the Content API.
const isFileMessageFromUser = (event: LineEvent): event is LineEvent & {
  replyToken: string;
  source: LineSource & { userId: string };
  message: { type: 'file'; id: string; fileName: string };
} => (
  event.type === 'message'
  && event.message?.type === 'file'
  && typeof event.message.id === 'string'
  && typeof event.message.fileName === 'string'
  && typeof event.replyToken === 'string'
  && event.source?.type === 'user'
  && typeof event.source.userId === 'string'
);

const isStickerMessageFromUser = (event: LineEvent): event is LineEvent & {
  replyToken: string;
  source: LineSource & { userId: string };
  message: { type: 'sticker' };
} => (
  event.type === 'message'
  && event.message?.type === 'sticker'
  && typeof event.replyToken === 'string'
  && event.source?.type === 'user'
  && typeof event.source.userId === 'string'
);

const isLocationMessageFromUser = (event: LineEvent): event is LineEvent & {
  replyToken: string;
  source: LineSource & { userId: string };
  message: { type: 'location'; latitude: number; longitude: number };
} => (
  event.type === 'message'
  && event.message?.type === 'location'
  && typeof event.message.latitude === 'number'
  && typeof event.message.longitude === 'number'
  && typeof event.replyToken === 'string'
  && event.source?.type === 'user'
  && typeof event.source.userId === 'string'
);

// A tap on the "new conversation" quick-reply button arrives as a postback
// carrying this data; the worker maps it to a thread reset.
const RESET_POSTBACK_DATA = 'action=new-thread';

const isNewThreadPostbackFromUser = (event: LineEvent): event is LineEvent & {
  replyToken: string;
  source: LineSource & { userId: string };
} => (
  event.type === 'postback'
  && event.postback?.data === RESET_POSTBACK_DATA
  && typeof event.replyToken === 'string'
  && event.source?.type === 'user'
  && typeof event.source.userId === 'string'
);

// The persistent "new conversation" button attached to bot replies so the user
// can reset the conversation anytime. Postback (not a message action) keeps it
// from leaving a stray user-text bubble or colliding with real input.
const newThreadQuickReply = (locale: Locale): LineQuickReply => ({
  items: [{
    type: 'action',
    action: {
      type:        'postback',
      label:       t('__quickReplyNewThread', locale),
      data:        RESET_POSTBACK_DATA,
      displayText: t('__quickReplyNewThread', locale),
    },
  }],
});

// Lets early-return paths (no agent / no openrouter key) surface a
// configuration notice regardless of the input modality.
const isReplyableUserMessage = (event: LineEvent): event is LineEvent & {
  replyToken: string;
  source: LineSource & { userId: string };
} => (
  isTextMessageFromUser(event)
  || isImageMessageFromUser(event)
  || isAudioMessageFromUser(event)
  || isFileMessageFromUser(event)
  || isStickerMessageFromUser(event)
  || isLocationMessageFromUser(event)
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
  let keySource: KeySource;
  try {
    const resolved = await resolveKey(admin, kek, {
      ownerId:     bot.ownerId,
      purpose:     'openai',
      platformKey: PLATFORM_OPENAI_KEY,
    });
    openaiKey = resolved.key;
    keySource = resolved.source;
  } catch (err) {
    if (err instanceof FreeByokRequiredError) {
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

  // Quota caps only platform-key usage (the spend fermi pays for); BYOK draws
  // on the owner's own OpenAI account and is uncapped. Peek to fast-fail over
  // cap; the unit is spent only after Whisper actually runs (below).
  const quota = keySource === 'platform'
    ? await peekQuota(admin, COUNTER_ENV, { ownerId: bot.ownerId, purpose: 'stt' })
    : null;
  if (quota && quota.remaining <= 0) {
    await safeReply(lineAccessToken, replyToken, t('__noticeQuotaSttExhausted', ownerLocale));
    return;
  }

  // Name lookup and the agent's normalize flag are both independent of
  // transcription, so start them here to overlap with the Whisper call
  // instead of serializing after it. resolveDisplayName never throws; the
  // agent load falls back to null (default-normalize) on any DB error.
  const namePromise = resolveDisplayName(admin, lineAccessToken, bot.id, groupId, userId);
  const agentPromise = bot.agentId
    ? findAgentById(admin, bot.agentId).catch(() => null)
    : Promise.resolve(null);

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
  // Whisper billed for the audio it processed; charge now that it succeeded
  // (an empty transcript still consumed Whisper time). A failed call returned
  // above and never reaches here.
  if (keySource === 'platform') {
    await consumeQuota(admin, COUNTER_ENV, { ownerId: bot.ownerId, purpose: 'stt' });
  }
  if (transcript.length === 0) {
    await safeReply(lineAccessToken, replyToken, t('__noticeAudioEmpty', ownerLocale));
    return;
  }

  // Whisper emits Simplified for Mandarin audio; run the same Simplified →
  // Taiwan Traditional pass the 1:1 reply path uses so the relay and the
  // stored context honor the agent's normalize_traditional setting. No
  // agent bound → default true, matching the agents column default.
  const agent = await agentPromise;
  const text = normalizeReplyText(transcript, { traditional: agent?.normalizeTraditional ?? true });

  const name = await namePromise;
  await safeReply(lineAccessToken, replyToken, `🎤 ${name}：${text}`);
  // The transcript also joins the group's thread so a later @mention has
  // the spoken context, per the "voice transcripts enter context" rule.
  await storeGroupContext(bot.id, groupId, userId, text);
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
        const senderId = event.source.userId;
        if (await checkGroupMemberRateLimit(admin, COUNTER_ENV, { botId: bot.id, groupId, externalUserId: senderId })) {
          await transcribeGroupAudio({
            bot,
            kek,
            lineAccessToken,
            ownerLocale,
            groupId,
            userId:     senderId,
            messageId:  event.message.id,
            replyToken: event.replyToken,
          });
        } else {
          await safeReply(lineAccessToken, event.replyToken, t('__noticeGroupRateLimited', ownerLocale));
        }
      } else if (isGroupTextMessage(event) && typeof event.source.userId === 'string') {
        const senderId = event.source.userId;
        const mentioned = event.message.mention?.mentionees?.some(m => m.isSelf) ?? false;
        if (!mentioned) {
          await storeGroupContext(bot.id, groupId, senderId, event.message.text);
        } else if (await checkGroupMemberRateLimit(admin, COUNTER_ENV, { botId: bot.id, groupId, externalUserId: senderId })) {
          // An @mention always gets a reply — ignoring an explicit summon
          // reads as "the bot is broken." The rate limit is the only brake
          // (group events skip the webhook's per-user limit); when it trips
          // the member still gets a reply, just the slow-down notice.
          groupMentions.push({
            groupId,
            senderId,
            text:           event.message.text,
            replyToken:     event.replyToken,
            eventTimestamp: typeof event.timestamp === 'number' ? event.timestamp : Date.now(),
          });
        } else {
          await safeReply(lineAccessToken, event.replyToken, t('__noticeGroupRateLimited', ownerLocale));
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
  // 'platform' → fermi's OpenRouter key (metered); 'byok' → the owner's own
  // (uncapped, so extended_run isn't charged).
  openrouterSource: KeySource;
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
  const { bot, agent, ownerLocale, ownerTimezone, openrouterKey, openrouterSource, lineAccessToken, kek, externalUserId, replyToken, userInput, eventTimestamp, group } = params;

  const subjectExternalId = group ? group.groupId : externalUserId;
  const subjectType: ThreadSubjectType = group ? 'group' : 'user';
  // 1:1 delivers / shows loading to the user; group delivers to the group.
  const deliverTo = group ? group.groupId : externalUserId;

  const threadId = await resolveOrCreateLatestThread(admin, bot.id, subjectExternalId, subjectType);
  switch (userInput.type) {
    case 'text':
      await appendMessage(admin, threadId, 'user', { type: 'text', text: userInput.text }, externalUserId);
      break;
    case 'audio': {
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
      break;
    }
    case 'image': {
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
      break;
    }
    case 'document':
      // Document: the extracted text is the persisted content (no original
      // bytes stored — nothing replays a file). History rebuild re-injects it
      // as `[file: name]\n<text>` so follow-up questions stay answerable.
      await appendMessage(admin, threadId, 'user', {
        type: 'document',
        filename: userInput.filename,
        text: userInput.text,
      }, externalUserId);
      break;
    case 'sticker':
      await appendMessage(admin, threadId, 'user', {
        type: 'sticker',
        keywords: userInput.keywords,
        ...(userInput.text ? { text: userInput.text } : {}),
      }, externalUserId);
      break;
    case 'location':
      await appendMessage(admin, threadId, 'user', {
        type: 'location',
        ...(userInput.title ? { title: userInput.title } : {}),
        ...(userInput.address ? { address: userInput.address } : {}),
        latitude: userInput.latitude,
        longitude: userInput.longitude,
      }, externalUserId);
      break;
    default: {
      // A new UserInput variant added without a persist branch trips this
      // at compile time rather than silently misfiling into an old branch.
      const exhaustive: never = userInput;
      throw new Error(`unhandled user input: ${JSON.stringify(exhaustive)}`);
    }
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
  // Re-prime now (the per-message prime before dispatch is the first one;
  // this covers the run itself), then refresh under LINE's 60s cap. Cleared
  // in `finally` so it never leaks. Only works in 1:1 chats, not groups.
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

    // Only opted-in agents pay for recall: gate the read on the memory
    // capability being attached, so agents without it keep the exact prior
    // hot path. The read runs alongside the history load to add no latency.
    const memoryEnabled = attachedCapabilities.some((c) => c.slug === 'memory');
    const [history, memory] = await Promise.all([
      loadRecentMessages(
        admin,
        threadId,
        HISTORY_WINDOW,
        group ? { accessToken: lineAccessToken, botId: bot.id, groupId: group.groupId } : undefined,
      ),
      memoryEnabled
        ? loadRecentMemories(admin, { botId: bot.id, subjectType, subjectExternalId, limit: MEMORY_INJECT_LIMIT })
            .catch((memoryErr) => {
              // Recall is best-effort personalization; a read outage degrades
              // to no memory rather than failing the whole reply.
              console.warn('memory recall failed; continuing without it', { botId: bot.id, err: String(memoryErr) });
              return [] as string[];
            })
        : Promise.resolve<string[]>([]),
    ]);
    // Inject current time + the owner's timezone so the LLM can resolve
    // relative times ("tomorrow 9am") for the reminder tools. In a group,
    // also append the group rules. Both are trusted fermi text, so they
    // live inside the wrap alongside the agent's own prompt. Recalled memory
    // rides in too, but fenced as untrusted (see renderMemoryBlock).
    const systemPrompt = wrapSystemPrompt(
      `${formatTimeContext(ownerTimezone)}\n\n${agent.systemPrompt ?? defaultSystemPrompt(agent.name)}${group ? GROUP_CONTEXT_PROMPT : ''}`,
      {
        hasTools: attachedCapabilities.length > 0,
        memory:   memory.length > 0 ? memory.map((m) => `- ${m}`).join('\n') : undefined,
      },
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
      toolContextBase: { admin, kek, ownerId: bot.ownerId, agentId: agent.id, threadId, botId: bot.id, externalUserId, subjectType, subjectExternalId, runId, attachments },
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
      // with a CTA; already-paid LLM cost up to that point is sunk. Only
      // platform-key runs are metered — a BYOK owner pays their own OpenRouter
      // tokens, so a long conversation costs fermi nothing and stays uncapped
      // (the technical MAX_AGENT_STEPS / wall-clock limits still bound it).
      beforeIteration: async () => {
        if (openrouterSource !== 'platform' || extendedRunConsumed || (Date.now() - eventTimestamp) < REPLY_BUDGET_MS) return null;
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
      try {
        // Resolve the key before charging quota: a Free owner with no key
        // (or a missing platform key) falls back to text here without being
        // charged a TTS unit. Has-key + exhausted-quota still flags the CTA.
        const resolved = await resolveKey(admin, kek, {
          ownerId: bot.ownerId,
          purpose: 'openai',
          platformKey: PLATFORM_OPENAI_KEY,
        });
        // Quota caps only platform-key usage; a BYOK owner's OpenAI account
        // covers their own TTS, so it's uncapped. Peek to fast-fail over cap;
        // the unit is spent only after synthesis succeeds (a failed call costs
        // nothing upstream, so it must not cost a quota unit).
        const ttsQuota = resolved.source === 'platform'
          ? await peekQuota(admin, COUNTER_ENV, { ownerId: bot.ownerId, purpose: 'tts' })
          : null;
        if (ttsQuota && ttsQuota.remaining <= 0) {
          ttsQuotaExhausted = true;
        } else {
          const speech = await synthesizeSpeech({
            apiKey:       resolved.key,
            text:         finalText,
            model:        agent.defaultTtsModel,
            voice:        agent.defaultTtsVoice,
            instructions: agent.ttsInstructions,
          });
          if (resolved.source === 'platform') {
            await consumeQuota(admin, COUNTER_ENV, { ownerId: bot.ownerId, purpose: 'tts' });
          }
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
        }
      } catch (ttsErr) {
        console.warn('TTS failed; falling back to text', {
          agentId: agent.id,
          ownerId: bot.ownerId,
          err: String(ttsErr),
        });
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

    // Persistent reset affordance: LINE shows the quick reply of the last
    // message in the send, so attach it there. 1:1 only — group replies go out
    // via a different path and don't carry it.
    if (!group) {
      outbound[outbound.length - 1].quickReply = newThreadQuickReply(ownerLocale);
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

  // A "new conversation" quick-reply tap arrives as a postback. Handle it before
  // agent/key gating so a reset works even on a misconfigured bot: soft-delete
  // the user's active threads (the next message starts fresh) and confirm.
  // Long-term memory is intentionally preserved.
  for (const event of events) {
    if (!isNewThreadPostbackFromUser(event)) continue;
    await softDeleteLatestThreads(admin, bot.id, event.source.userId);
    await deliverMessages({
      accessToken: lineAccessToken,
      replyToken:  event.replyToken,
      userId:      event.source.userId,
      messages:    [{ type: 'text', text: t('__noticeNewThreadStarted', ownerLocale), quickReply: newThreadQuickReply(ownerLocale) }],
      elapsedMs:   typeof event.timestamp === 'number' ? Date.now() - event.timestamp : 0,
    }).catch(err => console.error('new-thread confirm delivery failed', err));
  }
  // Reset-only payloads need no agent run; skip the rest to avoid pointless
  // agent/key resolution. Mixed payloads (rare) fall through and the postback
  // is inert in the dispatch loop below.
  if (events.every(isNewThreadPostbackFromUser) && groupMentions.length === 0) return;

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
  let openrouterSource: KeySource;
  try {
    const resolved = await resolveKey(admin, kek, {
      ownerId: bot.ownerId,
      purpose: 'openrouter',
      platformKey: PLATFORM_OPENROUTER_KEY,
    });
    openrouterKey = resolved.key;
    openrouterSource = resolved.source;
  } catch (err) {
    // FreeByokRequiredError = owner is on Free + hasn't connected.
    // PlatformKeyNotConfiguredError = Pro user but fermi's env is
    // missing (operational issue on the fermi side; user-facing
    // message must not blame the user). Any other throw is a real
    // DB/decryption error → bubble so pgmq retries.
    const noticeKey = err instanceof FreeByokRequiredError
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

    // Prime "..." as the worker's first act for any 1:1 message — before
    // image download / audio STT — so the indicator shows reliably (the Deno
    // worker isn't frozen mid-run like the webhook handler) without waiting on
    // those. runAgentLoop re-primes and keeps it alive under LINE's 60s cap.
    if (isReplyableUserMessage(event)) {
      void showLoadingAnimation(lineAccessToken, event.source.userId)
        .catch(err => console.error('loading animation prime failed', err));
    }

    if (isTextMessageFromUser(event)) {
      await runAgentLoop({
        bot,
        agent,
        ownerLocale,
        ownerTimezone,
        openrouterKey,
        openrouterSource,
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
        openrouterSource,
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

      // Resolve the OpenAI key before charging quota: a Free owner with no
      // key short-circuits here without being charged an STT unit. (Has-key
      // + exhausted-quota still gets the quota notice below — resolveKey
      // succeeds first.) STT runs before the agent loop because the rest of
      // the pipeline only knows text + image; a failed transcription starts
      // no agent_run.
      let openaiKey: string;
      let keySource: KeySource;
      try {
        const resolved = await resolveKey(admin, kek, {
          ownerId: bot.ownerId,
          purpose: 'openai',
          platformKey: PLATFORM_OPENAI_KEY,
        });
        openaiKey = resolved.key;
        keySource = resolved.source;
      } catch (err) {
        if (err instanceof FreeByokRequiredError) {
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

      // Quota caps only platform-key usage; BYOK is on the owner's own OpenAI
      // account and uncapped. Peek to fast-fail over cap; the unit is spent
      // only after Whisper actually runs (below).
      const sttQuota = keySource === 'platform'
        ? await peekQuota(admin, COUNTER_ENV, { ownerId: bot.ownerId, purpose: 'stt' })
        : null;
      if (sttQuota && sttQuota.remaining <= 0) {
        await safeReply(lineAccessToken, event.replyToken, t('__noticeQuotaSttExhausted', ownerLocale));
        continue;
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
      // Charge now that Whisper succeeded (an empty transcript still consumed
      // Whisper time); a failed call continued above without spending a unit.
      if (keySource === 'platform') {
        await consumeQuota(admin, COUNTER_ENV, { ownerId: bot.ownerId, purpose: 'stt' });
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
        openrouterSource,
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

    if (isFileMessageFromUser(event)) {
      const filename = event.message.fileName;
      // Extension gate before the download: don't spend a Content API fetch
      // on a file we can't read (e.g. .doc / .pptx / .zip).
      if (!isSupportedDocumentFilename(filename)) {
        await safeReply(lineAccessToken, event.replyToken, t('__noticeUnsupportedDocumentType', ownerLocale));
        continue;
      }

      let fileBytes: Uint8Array;
      try {
        const content = await fetchMessageContent(lineAccessToken, event.message.id);
        fileBytes = content.bytes;
      } catch (err) {
        if (err instanceof LineContentError && err.status === 413) {
          await safeReply(lineAccessToken, event.replyToken, t('__noticeDocumentTooLarge', ownerLocale));
          continue;
        }
        throw err;
      }

      let documentText: string;
      try {
        documentText = (await extractDocumentText(filename, fileBytes)).trim();
      } catch (err) {
        if (err instanceof UnsupportedFileError) {
          await safeReply(lineAccessToken, event.replyToken, t('__noticeUnsupportedDocumentType', ownerLocale));
          continue;
        }
        // A corrupt / unreadable PDF or docx lands here.
        console.warn('document extraction failed', { err: String(err) });
        await safeReply(lineAccessToken, event.replyToken, t('__noticeDocumentUnreadable', ownerLocale));
        continue;
      }
      // Empty after trim = no text layer (scanned / photo PDF) or an empty
      // file. unpdf reads the text layer, not OCR, so an image-only PDF is
      // expected to land here.
      if (!documentText) {
        await safeReply(lineAccessToken, event.replyToken, t('__noticeDocumentEmpty', ownerLocale));
        continue;
      }
      // Over the inline cap → the knowledge base (RAG) is the right home for a
      // document this large; carrying it in every turn here would not be.
      if (documentText.length > INLINE_DOCUMENT_MAX_CHARS) {
        await safeReply(lineAccessToken, event.replyToken, t('__noticeDocumentTooLong', ownerLocale));
        continue;
      }

      await runAgentLoop({
        bot,
        agent,
        ownerLocale,
        ownerTimezone,
        openrouterKey,
        openrouterSource,
        lineAccessToken,
        kek,
        externalUserId: event.source.userId,
        replyToken: event.replyToken,
        userInput: { type: 'document', lineMessageId: event.message.id, filename, text: documentText },
        eventTimestamp,
      });
      continue;
    }

    // Sticker / location carry no binary and no Content API fetch: the
    // webhook fields are the whole payload. Persist them as their own turn
    // and run the same loop as everything else — in a 1:1 chat a reply is
    // what tells the user the bot isn't dead.
    if (isStickerMessageFromUser(event)) {
      await runAgentLoop({
        bot,
        agent,
        ownerLocale,
        ownerTimezone,
        openrouterKey,
        openrouterSource,
        lineAccessToken,
        kek,
        externalUserId: event.source.userId,
        replyToken: event.replyToken,
        userInput: {
          type: 'sticker',
          keywords: Array.isArray(event.message.keywords) ? event.message.keywords : [],
          ...(typeof event.message.text === 'string' ? { text: event.message.text } : {}),
        },
        eventTimestamp,
      });
      continue;
    }

    if (isLocationMessageFromUser(event)) {
      await runAgentLoop({
        bot,
        agent,
        ownerLocale,
        ownerTimezone,
        openrouterKey,
        openrouterSource,
        lineAccessToken,
        kek,
        externalUserId: event.source.userId,
        replyToken: event.replyToken,
        userInput: {
          type: 'location',
          ...(typeof event.message.title === 'string' ? { title: event.message.title } : {}),
          ...(typeof event.message.address === 'string' ? { address: event.message.address } : {}),
          latitude: event.message.latitude,
          longitude: event.message.longitude,
        },
        eventTimestamp,
      });
      continue;
    }

    // Unsupported message subtypes (video / imagemap) get one scope-notice
    // reply. Non-message events (follow / unfollow / postback / ...) drop
    // silently — they have no replyToken to address.
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
      openrouterSource,
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
