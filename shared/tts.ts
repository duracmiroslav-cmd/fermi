// OpenAI TTS model + voice catalog. Backs both the per-agent
// voice config and the dashboard preview button.
//
// Default model is gpt-4o-mini-tts: ~25x cheaper than tts-1
// ($0.60 vs $15 per 1M chars), better quality, and the only one
// of the three that accepts a natural-language `instructions`
// param for tone control. tts-1 stays in the catalog because its
// lower latency (~500ms vs ~1.5s) is real perceived-latency value
// for users who'd trade tone control for snappier replies.

// Flat ID list is the source of truth for the TtsModel union and for
// Zod enum validation; TTS_MODELS pairs each ID with its display name
// so dropdowns can render the human label without an extra lookup
// table at each call site.
//
// Pinned to the 2025-03-20 launch snapshot, not the floating
// `gpt-4o-mini-tts` alias. The alias started silently ignoring both
// `instructions` and `speed` params around 2026-01 (reported on the
// OpenAI dev forum), making tone / pace control inert. The snapshot
// preserves the original behavior. Revisit when OpenAI fixes the
// alias or deprecates this snapshot.
export const TTS_MODEL_IDS = ['gpt-4o-mini-tts-2025-03-20', 'tts-1', 'tts-1-hd'] as const;
export type TtsModel = (typeof TTS_MODEL_IDS)[number];

export const TTS_MODELS: readonly { name: string; value: TtsModel }[] = [
  { name: 'GPT-4o mini TTS', value: 'gpt-4o-mini-tts-2025-03-20' },
  { name: 'TTS-1', value: 'tts-1' },
  { name: 'TTS-1 HD', value: 'tts-1-hd' },
];

// Built-in voices listed in OpenAI's audio docs. The catalog
// page claims 13 voices total; only these 10 are named in the
// public spec, so we expose the named set and treat unknown
// stored values defensively at the parser. TTS_VOICE_IDS is the
// source of truth for the TtsVoice union and Zod enum; TTS_VOICES
// pairs each ID with its display name for dropdown rendering.
export const TTS_VOICE_IDS = [
  'cedar', 'marin',
  'alloy', 'ash', 'ballad', 'coral',
  'echo', 'sage', 'shimmer', 'verse',
] as const;
export type TtsVoice = (typeof TTS_VOICE_IDS)[number];

export const TTS_VOICES: readonly { name: string; value: TtsVoice }[] = [
  { name: 'Cedar', value: 'cedar' },
  { name: 'Marin', value: 'marin' },
  { name: 'Alloy', value: 'alloy' },
  { name: 'Ash', value: 'ash' },
  { name: 'Ballad', value: 'ballad' },
  { name: 'Coral', value: 'coral' },
  { name: 'Echo', value: 'echo' },
  { name: 'Sage', value: 'sage' },
  { name: 'Shimmer', value: 'shimmer' },
  { name: 'Verse', value: 'verse' },
];

export const DEFAULT_TTS_MODEL: TtsModel = 'gpt-4o-mini-tts-2025-03-20';
export const DEFAULT_TTS_VOICE: TtsVoice = 'cedar';

// Display-name helpers + their default counterparts. Catalog values
// like `gpt-4o-mini-tts-2025-03-20` or `cedar` are wire-level IDs;
// UI surfaces (placeholders, "(default)" hints, read-only views)
// should render the human label from TTS_MODELS / TTS_VOICES instead.
// Falling back to the raw ID is safe for stale data without breaking
// the page.
export const getTtsModelName = (id: TtsModel): string =>
  TTS_MODELS.find(m => m.value === id)?.name ?? id;

export const getTtsVoiceName = (id: TtsVoice): string =>
  TTS_VOICES.find(v => v.value === id)?.name ?? id;

export const DEFAULT_TTS_MODEL_NAME = getTtsModelName(DEFAULT_TTS_MODEL);
export const DEFAULT_TTS_VOICE_NAME = getTtsVoiceName(DEFAULT_TTS_VOICE);

// Only gpt-4o-mini-tts honors the natural-language `instructions`
// parameter for tone / accent / speed control. The older tts-1 /
// tts-1-hd models silently ignore it. Worker + preview gate on
// this so users picking tts-1 don't see their instructions go
// nowhere without explanation.
export const supportsTtsInstructions = (model: TtsModel): boolean =>
  model === 'gpt-4o-mini-tts-2025-03-20';

// Per-model voice support. The legacy tts-1 / tts-1-hd line predates
// the newer voices (cedar, marin, ballad, verse) and rejects them
// with a 400 from OpenAI; only the intersection that works on both
// model families is listed for the legacy entries. gpt-4o-mini-tts
// accepts the full catalog.
export const VOICES_BY_MODEL: Record<TtsModel, readonly TtsVoice[]> = {
  'gpt-4o-mini-tts-2025-03-20': TTS_VOICE_IDS,
  'tts-1':                      ['alloy', 'ash', 'coral', 'echo', 'sage', 'shimmer'],
  'tts-1-hd':                   ['alloy', 'ash', 'coral', 'echo', 'sage', 'shimmer'],
};

export const supportsTtsVoice = (model: TtsModel, voice: TtsVoice): boolean =>
  (VOICES_BY_MODEL[model] as readonly TtsVoice[]).includes(voice);

// Resolves the voice the worker should actually send to OpenAI given
// a stored (model, voice) pair. Defensive: a legacy row or a model
// edited after the voice was picked may land here with an
// incompatible combo. Falling back to the model's first listed voice
// keeps the reply audible instead of 4xx-ing and dropping to text.
export const resolveTtsVoice = (model: TtsModel, voice: TtsVoice | null): TtsVoice => {
  if (voice && supportsTtsVoice(model, voice)) return voice;
  return VOICES_BY_MODEL[model][0]!;
};

// Defensive parser: stale DB rows or hand-edited values fall back
// to the catalog default rather than letting an unknown string
// flow to OpenAI and 4xx.
export const parseTtsModel = (raw: string | null): TtsModel | null => {
  if (raw === null) return null;
  return (TTS_MODEL_IDS as readonly string[]).includes(raw) ? raw as TtsModel : null;
};

export const parseTtsVoice = (raw: string | null): TtsVoice | null => {
  if (raw === null) return null;
  return (TTS_VOICE_IDS as readonly string[]).includes(raw) ? raw as TtsVoice : null;
};

// Short bilingual line so the owner can hear English voices reading
// Chinese, surfacing the accent caveat in-product without separate
// caveat copy in the UI.
export const TTS_PREVIEW_SAMPLE_TEXT
  = '你好，這是 fermi 試聽。Hello, this is a fermi preview.';
