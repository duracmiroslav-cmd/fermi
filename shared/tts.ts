// OpenAI TTS model + voice catalog. Backs both the per-agent
// voice config and the dashboard preview button.
//
// Default model is gpt-4o-mini-tts: ~25x cheaper than tts-1
// ($0.60 vs $15 per 1M chars), better quality, and the only one
// of the three that accepts a natural-language `instructions`
// param for tone control. tts-1 stays in the catalog because its
// lower latency (~500ms vs ~1.5s) is real perceived-latency value
// for users who'd trade tone control for snappier replies.

export const TTS_MODELS = ['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd'] as const;
export type TtsModel = (typeof TTS_MODELS)[number];

// Built-in voices listed in OpenAI's audio docs. The catalog
// page claims 13 voices total; only these 10 are named in the
// public spec, so we expose the named set and treat unknown
// stored values defensively at the parser.
export const TTS_VOICES = [
  'cedar', 'marin',
  'alloy', 'ash', 'ballad', 'coral',
  'echo', 'sage', 'shimmer', 'verse',
] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

export const DEFAULT_TTS_MODEL: TtsModel = 'gpt-4o-mini-tts';
export const DEFAULT_TTS_VOICE: TtsVoice = 'cedar';

// Only gpt-4o-mini-tts honors the natural-language `instructions`
// parameter for tone / accent / speed control. The older tts-1 /
// tts-1-hd models silently ignore it. Worker + preview gate on
// this so users picking tts-1 don't see their instructions go
// nowhere without explanation.
export const supportsTtsInstructions = (model: TtsModel): boolean =>
  model === 'gpt-4o-mini-tts';

// Defensive parser: stale DB rows or hand-edited values fall back
// to the catalog default rather than letting an unknown string
// flow to OpenAI and 4xx.
export const parseTtsModel = (raw: string | null): TtsModel | null => {
  if (raw === null) return null;
  return (TTS_MODELS as readonly string[]).includes(raw) ? raw as TtsModel : null;
};

export const parseTtsVoice = (raw: string | null): TtsVoice | null => {
  if (raw === null) return null;
  return (TTS_VOICES as readonly string[]).includes(raw) ? raw as TtsVoice : null;
};

// Short bilingual line so the owner can hear English voices reading
// Chinese, surfacing the accent caveat in-product without separate
// caveat copy in the UI.
export const TTS_PREVIEW_SAMPLE_TEXT
  = '你好，這是 fermi 試聽。Hello, this is a fermi preview.';
