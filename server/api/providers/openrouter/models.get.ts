import { getCurrentUser } from '~~/server/utils/auth';

interface OpenRouterModel {
  id:             string;
  name:           string;
  context_length: number;
  architecture:   { modality: string };
  pricing:        { prompt: string; completion: string };
}

interface ModelAvatar {
  icon?: string;
  text?: string;
}

interface ProviderModel {
  id:             string;
  name:           string;
  contextLength:  number;
  isFree:         boolean;
  promptCost:     number;
  completionCost: number;
  modality:       string;
  avatar:         ModelAvatar;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_CONTEXT_LENGTH = 32_000;
const EXCLUDED_TAG_SUFFIXES = [':beta', ':experimental', ':exp', ':preview', ':legacy'];
// Only surface models from these providers, keeps the picker tight and dependable.
const ALLOWED_PROVIDERS = new Set([
  'amazon',
  'anthropic',
  'cohere',
  'deepseek',
  'google',
  'meta-llama',
  'microsoft',
  'mistralai',
  'nvidia',
  'openai',
  'perplexity',
  'qwen',
  'x-ai',
]);

// id prefix → Iconify icon. Unknown providers fall back to a letter avatar.
const PROVIDER_ICONS: Record<string, string> = {
  'amazon':     'i-simple-icons-amazonaws',
  'anthropic':  'i-simple-icons-anthropic',
  'deepseek':   'i-simple-icons-deepseek',
  'google':     'i-simple-icons-google',
  'meta-llama': 'i-simple-icons-meta',
  'microsoft':  'i-simple-icons-microsoft',
  'mistralai':  'i-simple-icons-mistralai',
  'nvidia':     'i-simple-icons-nvidia',
  'openai':     'i-simple-icons-openai',
  'perplexity': 'i-simple-icons-perplexity',
  'qwen':       'i-simple-icons-alibabacloud',
  'x-ai':       'i-simple-icons-x',
};

const avatarFor = (id: string): ModelAvatar => {
  const prefix = id.split('/')[0] ?? '';
  return { icon: PROVIDER_ICONS[prefix] ?? 'i-lucide-cpu' };
};

let cache: { data: ProviderModel[]; expiresAt: number } | null = null;

const fetchModels = async (): Promise<ProviderModel[]> => {
  if (cache && cache.expiresAt > Date.now()) return cache.data;

  const res = await $fetch<{ data: OpenRouterModel[] }>('https://openrouter.ai/api/v1/models');

  const models = res.data
    .filter(m => m.architecture.modality.endsWith('->text'))
    .filter(m => m.context_length >= MIN_CONTEXT_LENGTH)
    .filter(m => !EXCLUDED_TAG_SUFFIXES.some(tag => m.id.endsWith(tag)))
    .filter(m => ALLOWED_PROVIDERS.has(m.id.split('/')[0] ?? ''))
    .map((m): ProviderModel => {
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
        avatar:        avatarFor(m.id),
      };
    })
    .sort((a, b) => {
      if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
      return b.contextLength - a.contextLength;
    });

  cache = { data: models, expiresAt: Date.now() + CACHE_TTL_MS };
  return models;
};

export default defineEventHandler(async (event) => {
  await getCurrentUser(event);
  return fetchModels();
});
