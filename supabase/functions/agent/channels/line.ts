// LINE channel adapter: all Messaging API (reply / push) and Content API
// (binary download) I/O for the worker. The worker depends on this
// surface, not on LINE URLs/shapes, so a second platform becomes a
// sibling under `channels/`. A shared `Channel` interface waits until a
// second platform reveals the real common shape.

export class LineContentError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export class LineReplyError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export class LinePushError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

// ---- Inbound: Content API (api-data.line.me) -------------------------------

const LINE_CONTENT_BASE = 'https://api-data.line.me/v2/bot/message';

// Matches LINE's own per-message size cap (10MB) for all binary modalities,
// image, audio, video, file. Enforced before arrayBuffer() resolves so a
// malicious or mislabelled stream can't exhaust the Edge Function's memory.
const MAX_LINE_CONTENT_BYTES = 10 * 1024 * 1024;

export interface LineMessageContent {
  bytes: Uint8Array;
  contentType: string | null;
  sizeBytes: number;
}

export const fetchMessageContent = async (
  channelAccessToken: string,
  messageId: string,
): Promise<LineMessageContent> => {
  const url = `${LINE_CONTENT_BASE}/${encodeURIComponent(messageId)}/content`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${channelAccessToken}` },
  });
  if (!res.ok) {
    throw new LineContentError(res.status, `LINE Content API ${res.status}`);
  }
  const declaredLength = Number(res.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_LINE_CONTENT_BYTES) {
    throw new LineContentError(413, `LINE message content exceeds ${MAX_LINE_CONTENT_BYTES} bytes`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_LINE_CONTENT_BYTES) {
    throw new LineContentError(413, `LINE message content exceeds ${MAX_LINE_CONTENT_BYTES} bytes`);
  }
  return {
    bytes,
    contentType: res.headers.get('content-type'),
    sizeBytes: bytes.byteLength,
  };
};

// ---- Outbound: Messaging API (api.line.me) ---------------------------------

export type LineMessage
  = | { type: 'text';  text: string }
    | { type: 'audio'; originalContentUrl: string; duration: number }
    | { type: 'image'; originalContentUrl: string; previewImageUrl: string };

// LINE reply tokens are valid roughly one minute from webhook delivery.
// Switch to Push API after ~25s elapsed, leaving headroom for the LLM
// call still in flight and the LINE round-trip, and avoiding a Reply
// 400 that wastes the only delivery attempt.
export const REPLY_BUDGET_MS = 25_000;

// LINE Reply / Push API both accept up to 5 messages per call.
const LINE_MESSAGES_PER_CALL = 5;

const replyMessages = async (
  accessToken: string,
  replyToken: string,
  messages: LineMessage[],
): Promise<void> => {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ replyToken, messages: messages.slice(0, LINE_MESSAGES_PER_CALL) }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new LineReplyError(res.status, `LINE Reply API ${res.status}: ${body}`);
  }
};

// Exported for callers that only ever push (no reply token to spend),
// e.g. reminder fires. `deliverMessages` stays the entry point for the
// reply-then-fallback-to-push path of a live conversation turn.
export const pushMessages = async (
  accessToken: string,
  to: string,
  messages: LineMessage[],
): Promise<void> => {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to, messages: messages.slice(0, LINE_MESSAGES_PER_CALL) }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new LinePushError(res.status, `LINE Push API ${res.status}: ${body}`);
  }
};

// Re-arms LINE's typing indicator ("..."). Each call lasts at most 60s, so a
// long multi-step run re-fires before the previous one lapses to avoid looking
// dead. loadingSeconds must be a multiple of 5 in [5, 60]. Best-effort: the
// caller swallows failures so a missing indicator never breaks the run.
export const showLoadingAnimation = async (
  accessToken: string,
  chatId: string,
  loadingSeconds = 60,
): Promise<void> => {
  const res = await fetch('https://api.line.me/v2/bot/chat/loading/start', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ chatId, loadingSeconds }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new LinePushError(res.status, `LINE Loading API ${res.status}: ${body}`);
  }
};

export type DeliveryMethod = 'reply' | 'push';

// Delivers the bot's response, picking Reply (free) when we're inside the
// reply-token window and Push (quota) when we're not. If a Reply attempt
// fails with 400 (token expired or already used), falls back to Push so the
// messages aren't dropped on the floor.
export const deliverMessages = async (params: {
  accessToken: string;
  replyToken: string;
  userId: string;
  messages: LineMessage[];
  elapsedMs: number;
}): Promise<DeliveryMethod> => {
  const { accessToken, replyToken, userId, messages, elapsedMs } = params;

  if (elapsedMs >= REPLY_BUDGET_MS) {
    await pushMessages(accessToken, userId, messages);
    return 'push';
  }

  try {
    await replyMessages(accessToken, replyToken, messages);
    return 'reply';
  } catch (err) {
    if (err instanceof LineReplyError && err.status === 400) {
      await pushMessages(accessToken, userId, messages);
      return 'push';
    }
    throw err;
  }
};

// Reply with a single text message, swallowing the terminal 400 from an
// expired/used reply token (used for inline notices). Other errors bubble so
// pgmq retries the whole webhook payload.
export const safeReply = async (
  accessToken: string,
  replyToken: string,
  text: string,
): Promise<void> => {
  try {
    await replyMessages(accessToken, replyToken, [{ type: 'text', text }]);
  } catch (err) {
    if (err instanceof LineReplyError && err.status === 400) {
      console.warn('reply token expired or already used; dropping', { replyToken });
      return;
    }
    throw err;
  }
};
