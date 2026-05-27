// OpenAI Whisper client. Direct fetch wrapper for the
// `/v1/audio/transcriptions` endpoint — OpenRouter doesn't route
// audio transcription, so the BYOK / platform-key resolution for
// this call uses `purpose: 'openai'` (separate from `openrouter`).

import type { AudioMime } from '../../../shared/audio.ts';

export class STTError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const WHISPER_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_STT_MODEL = 'whisper-1';

// Extension Whisper recognizes for each accepted mime. Wrong extension
// makes OpenAI reject the upload with a 400 — the mime header alone
// isn't enough.
const extFor = (mime: AudioMime): string => {
  switch (mime) {
    case 'audio/m4a': return 'm4a';
  }
};

export const transcribeAudio = async (params: {
  apiKey: string;
  bytes: Uint8Array;
  mime: AudioMime;
}): Promise<string> => {
  const { apiKey, bytes, mime } = params;
  const form = new FormData();
  form.append('file', new Blob([bytes as unknown as ArrayBuffer], { type: mime }), `audio.${extFor(mime)}`);
  form.append('model', DEFAULT_STT_MODEL);
  // `response_format=text` makes Whisper return raw text rather than a
  // JSON envelope — saves a parse step and removes one place for the
  // shape to drift.
  form.append('response_format', 'text');

  const res = await fetch(WHISPER_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new STTError(res.status, `Whisper ${res.status}: ${body.slice(0, 400)}`);
  }
  const transcript = (await res.text()).trim();
  return transcript;
};
