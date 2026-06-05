import { getCurrentUser } from '~~/server/utils/auth';
import {
  type CatalogModel,
  OPENROUTER_MODELS_URL,
  type RawOpenRouterModel,
  filterOpenRouterModels,
} from '~~/shared/openrouterModels';

interface ModelAvatar {
  icon?: string;
  text?: string;
}

interface ProviderModel extends CatalogModel {
  avatar: ModelAvatar;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

// Model id prefix → Iconify icon.
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

const getAvatar = (id: string): ModelAvatar => {
  const prefix = id.split('/')[0] ?? '';
  return { icon: PROVIDER_ICONS[prefix] ?? 'i-lucide-cpu' };
};

let cache: { data: ProviderModel[]; expiresAt: number } | null = null;

const fetchModels = async (): Promise<ProviderModel[]> => {
  if (cache && cache.expiresAt > Date.now()) return cache.data;

  const res = await $fetch<{ data: RawOpenRouterModel[] }>(OPENROUTER_MODELS_URL);
  const models = filterOpenRouterModels(res.data).map(m => ({ ...m, avatar: getAvatar(m.id) }));

  cache = { data: models, expiresAt: Date.now() + CACHE_TTL_MS };
  return models;
};

export default defineEventHandler(async (event) => {
  await getCurrentUser(event);
  return fetchModels();
});
