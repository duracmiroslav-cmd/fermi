// OpenAI tts-1 client. Direct fetch wrapper for the
// `/v1/audio/speech` endpoint. Returns raw AAC bytes (ADTS frames)
// because OpenAI's `response_format=aac` is the closest to LINE's
// expected m4a — some clients accept it as-is; if LINE rejects we
// add an MP4 muxing pass downstream rather than baking it in here.

export class TTSError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';
const DEFAULT_TTS_MODEL = 'tts-1';
const DEFAULT_VOICE = 'alloy';

// LINE audio messages need a duration in milliseconds for the player
// UI. Without decoding the AAC frames (heavy in Edge runtime) we
// estimate from text length. Typical TTS rate at OpenAI's default
// speed is ~14 chars/sec for English, slower for CJK (~7 chars/sec).
// Use a conservative 10 chars/sec — being a bit long is fine; LINE
// just trims the player when the underlying file ends.
const ESTIMATED_CHARS_PER_SECOND = 10;

export const estimateDurationMs = (text: string): number => {
  const seconds = Math.max(1, Math.ceil(text.length / ESTIMATED_CHARS_PER_SECOND));
  return seconds * 1000;
};

export interface SpeechResult {
  bytes: Uint8Array;
  mime: 'audio/aac';
  durationMs: number;
}

export const synthesizeSpeech = async (params: {
  apiKey: string;
  text: string;
  voice?: string;
}): Promise<SpeechResult> => {
  const { apiKey, text, voice = DEFAULT_VOICE } = params;

  const res = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_TTS_MODEL,
      input: text,
      voice,
      response_format: 'aac',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new TTSError(res.status, `OpenAI tts-1 ${res.status}: ${body.slice(0, 400)}`);
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  return {
    bytes,
    mime: 'audio/aac',
    durationMs: estimateDurationMs(text),
  };
};
