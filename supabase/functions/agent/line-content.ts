// Fetches binary content of a LINE message (image, video, audio,
// file) via the LINE Content API. Worker only uses image today; the
// helper is generic enough for future modalities.

export class LineContentError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const LINE_CONTENT_BASE = 'https://api-data.line.me/v2/bot/message';

// Matches LINE's own per-message image cap. Enforced before the
// arrayBuffer() resolves so a malicious or mislabelled stream can't
// exhaust the Edge Function's memory.
export const MAX_LINE_IMAGE_BYTES = 10 * 1024 * 1024;

export interface LineMessageContent {
  bytes: Uint8Array;
  contentType: string | null;
  sizeBytes: number;
}

export const fetchLineMessageContent = async (
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
  if (declaredLength > MAX_LINE_IMAGE_BYTES) {
    throw new LineContentError(413, `LINE message content exceeds ${MAX_LINE_IMAGE_BYTES} bytes`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_LINE_IMAGE_BYTES) {
    throw new LineContentError(413, `LINE message content exceeds ${MAX_LINE_IMAGE_BYTES} bytes`);
  }
  return {
    bytes,
    contentType: res.headers.get('content-type'),
    sizeBytes: bytes.byteLength,
  };
};
