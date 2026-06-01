// Returns raw AAC bytes (ADTS frames): OpenAI's `response_format=aac`
// is the closest to LINE's expected m4a. An MP4 muxing pass can be
// added downstream if LINE rejects the raw frames.

import {
  DEFAULT_TTS_MODEL,
  type TtsModel,
  type TtsVoice,
  resolveTtsVoice,
  supportsTtsInstructions,
} from '../../../shared/tts.ts';

export class TTSError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';

// LINE audio messages need a duration in milliseconds for the player
// UI. Without decoding the AAC frames (heavy in Edge runtime) we
// estimate from text length. Typical TTS rate at OpenAI's default
// speed is ~14 chars/sec for English, slower for CJK (~7 chars/sec).
// Use a conservative 10 chars/sec. Being a bit long is fine, LINE
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
  apiKey:       string;
  text:         string;
  model?:       TtsModel | null;
  voice?:       TtsVoice | null;
  instructions?: string | null;
}): Promise<SpeechResult> => {
  const { apiKey, text } = params;
  const model = params.model ?? DEFAULT_TTS_MODEL;
  // `resolveTtsVoice` swaps an incompatible stored voice (e.g. cedar
  // on tts-1, set before the model was switched) for the model's
  // own default. Without this an agent edit could permanently 4xx
  // TTS for that user until they reopen the form and re-pick.
  const voice = resolveTtsVoice(model, params.voice ?? null);

  const body: Record<string, unknown> = {
    model,
    input: text,
    voice,
    response_format: 'aac',
  };
  // Older models (tts-1 / tts-1-hd) silently ignore `instructions`,
  // but a few accounts have surfaced 400s when the param is present.
  // Drop it unless the model supports it.
  if (params.instructions && supportsTtsInstructions(model)) {
    body.instructions = params.instructions;
  }

  const res = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new TTSError(res.status, `OpenAI ${model} ${res.status}: ${errBody.slice(0, 400)}`);
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  return {
    bytes,
    mime: 'audio/aac',
    durationMs: estimateDurationMs(text),
  };
};
