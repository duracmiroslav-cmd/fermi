// LINE channel adapter: all LINE Messaging API (reply / push) and Content
// API (binary download) I/O for the agent worker. The worker depends on this
// module's surface rather than on LINE URLs/shapes directly, so a future
// platform (Telegram, etc.) becomes a sibling adapter under `channels/`
// instead of scattered edits. A cross-platform `Channel` interface is
// deliberately deferred until a second platform exists and the real common
// shape is visible.

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

// Fetches binary content of a LINE message (image, video, audio, file) via
// the LINE Content API. Generic across modalities: returns raw bytes plus
// the declared content type.
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

// LINE outbound message shapes we emit. Adding a new variant (flex, sticker,
// video) extends the union here; the JSON.stringify body just forwards the
// discriminated objects straight to LINE's API.
export type LineMessage
  = | { type: 'text';  text: string }
    | { type: 'audio'; originalContentUrl: string; duration: number }
    | { type: 'image'; originalContentUrl: string; previewImageUrl: string };

// LINE reply tokens are valid roughly one minute from webhook delivery.
// Switch to Push API once we've burned ~25s, leaving comfortable headroom
// for the LLM call still in flight and the LINE round-trip, and avoiding a
// Reply 400 wasting the only delivery attempt.
export const REPLY_BUDGET_MS = 25_000;

// LINE Reply / Push API both accept up to 5 messages in one call. We cap at
// the API limit to keep the contract explicit.
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

const pushMessages = async (
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
