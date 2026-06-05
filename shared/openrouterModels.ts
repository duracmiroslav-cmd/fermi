// Shared catalog filter over OpenRouter's /models response. Used by the
// Nuxt picker endpoint (adds provider icons on top) and by fermion's
// list_models / model-validation in the agent Edge Function, so both pick
// from the exact same set — web-standard only, no node:* (Deno imports it).

export interface RawOpenRouterModel {
  id:             string;
  name:           string;
  context_length: number;
  architecture:   { modality: string };
  pricing:        { prompt: string; completion: string };
}

export interface CatalogModel {
  id:             string;
  name:           string;
  contextLength:  number;
  isFree:         boolean;
  promptCost:     number;
  completionCost: number;
  modality:       string;
  // Accepts image input → safe as an agent's vision model.
  vision:         boolean;
}

const MIN_CONTEXT_LENGTH = 32_000;
const EXCLUDED_TAG_SUFFIXES = [':beta', ':experimental', ':exp', ':preview', ':legacy'];

// Only surface models from these providers, keeps the picker tight and
// dependable. Exported so fermion can offer/validate a provider filter
// (the id prefix is the provider).
export const MODEL_PROVIDERS = [
  'amazon', 'anthropic', 'cohere', 'deepseek', 'google', 'meta-llama',
  'microsoft', 'mistralai', 'nvidia', 'openai', 'perplexity', 'qwen', 'x-ai',
] as const;

const ALLOWED_PROVIDERS = new Set<string>(MODEL_PROVIDERS);

// The provider segment of a model id ("anthropic/claude-opus-4.7" → "anthropic").
export const modelProvider = (id: string): string => id.split('/')[0] ?? '';

// Input side of an OpenRouter modality string ("text+image->text").
const acceptsImage = (modality: string): boolean =>
  (modality.split('->')[0] ?? '').includes('image');

export const filterOpenRouterModels = (raw: RawOpenRouterModel[]): CatalogModel[] =>
  raw
    .filter(m => m.architecture.modality.endsWith('->text'))
    .filter(m => m.context_length >= MIN_CONTEXT_LENGTH)
    .filter(m => !EXCLUDED_TAG_SUFFIXES.some(tag => m.id.endsWith(tag)))
    .filter(m => ALLOWED_PROVIDERS.has(m.id.split('/')[0] ?? ''))
    .map((m): CatalogModel => {
      const promptCost = Number(m.pricing.prompt);
      const completionCost = Number(m.pricing.completion);
      return {
        id:            m.id,
        name:          m.name,
        contextLength: m.context_length,
        isFree:        promptCost === 0 && completionCost === 0,
        promptCost,
        completionCost,
        modality:      m.architecture.modality,
        vision:        acceptsImage(m.architecture.modality),
      };
    })
    .sort((a, b) => {
      if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
      return b.contextLength - a.contextLength;
    });

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
