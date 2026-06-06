// The image-generation model catalog: which fal models the image-gen capability
// can use, each model's owner-config knobs, and how to translate fermi's
// friendly size enum + owner config into that model's fal request params.
//
// fal models disagree on their request schema — nano-banana (Gemini Flash
// Image) takes `aspect_ratio` and a graduated `safety_tolerance`; Seedream /
// Ideogram take an `image_size` preset and have no graduated safety knob — so
// each model owns a `buildParams` adapter rather than one shared body shape.

import type { CapabilityConfig, CapabilitySettingField } from './capabilities.ts';

// Friendly aspect the LLM picks; mapped per-model to that model's own sizing
// parameter.
export type ImageSize = 'square' | 'portrait' | 'landscape';

// Owner content-filter strength for models with graduated safety (fal
// `safety_tolerance`, 1 strict – 6 permissive). Reject non-integers /
// out-of-band so a stale or hand-edited config can't 4xx the call; undefined ⇒
// the model's own default.
export const parseSafetyTolerance = (raw: unknown): number | undefined =>
  typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 6
    ? raw
    : undefined;

// `label` / `minLabel` / `maxLabel` are i18n keys (the dashboard $t's them);
// the worker ignores them.
const SAFETY_TOLERANCE_FIELD: CapabilitySettingField = {
  key:      'safetyTolerance',
  type:     'slider',
  label:    '__labelSafetyFilter',
  min:      1,
  max:      6,
  default:  4,
  minLabel: '__labelStrict',
  maxLabel: '__labelPermissive',
};

// fal's image_size presets, shared by the models that use that schema.
const IMAGE_SIZE_PRESET: Record<ImageSize, string> = {
  square:    'square_hd',
  portrait:  'portrait_16_9',
  landscape: 'landscape_16_9',
};

export interface ImageModelSpec {
  id:          string;
  displayName: string;
  // Owner-config knobs unique to this model, rendered in the capability
  // settings panel only while this model is the selected one.
  fields:      CapabilitySettingField[];
  // The model-specific request params (sizing + safety) merged into the fal
  // body. Reads the owner's capability config and validates what it touches.
  buildParams: (size: ImageSize, config: CapabilityConfig) => Record<string, unknown>;
}

const NANO_BANANA: ImageModelSpec = {
  id:          'fal-ai/nano-banana',
  displayName: 'Nano Banana',
  fields:      [SAFETY_TOLERANCE_FIELD],
  buildParams: (size, config) => {
    // nano-banana only honors aspect_ratio (a stray image_size is dropped and
    // every image falls back to 1:1). safety_tolerance is a string enum on fal.
    const tolerance = parseSafetyTolerance(config.safetyTolerance);
    return {
      aspect_ratio: ({ square: '1:1', portrait: '9:16', landscape: '16:9' } as const)[size],
      ...(tolerance === undefined ? {} : { safety_tolerance: String(tolerance) }),
    };
  },
};

const SEEDREAM: ImageModelSpec = {
  id:          'fal-ai/bytedance/seedream/v4.5/text-to-image',
  displayName: 'Seedream V4.5',
  fields:      [],
  buildParams: size => ({ image_size: IMAGE_SIZE_PRESET[size] }),
};

const IDEOGRAM: ImageModelSpec = {
  id:          'fal-ai/ideogram/v3',
  displayName: 'Ideogram V3',
  fields:      [],
  buildParams: size => ({ image_size: IMAGE_SIZE_PRESET[size] }),
};

export const IMAGE_MODELS: ImageModelSpec[] = [NANO_BANANA, SEEDREAM, IDEOGRAM];

export const DEFAULT_IMAGE_MODEL = NANO_BANANA.id;

// Validate an owner-supplied model id against the allowlist before it reaches
// the fal URL (`https://fal.run/{id}`) — an arbitrary string would be path
// injection. Unknown / absent ⇒ the default model.
export const resolveImageModel = (id: unknown): ImageModelSpec =>
  IMAGE_MODELS.find(m => m.id === id) ?? NANO_BANANA;
