import { AGENT_LIMIT, BOT_LIMIT, type Tier } from '~~/shared/constants/tiers';

const LIMIT_MAP = {
  agents: AGENT_LIMIT,
  bots: BOT_LIMIT,
} as const;

export const useTierLimit = <T = unknown>(kind: 'agents' | 'bots') => {
  const headers = useRequestHeaders(['cookie']);
  const profile = useFetch<{ tier: Tier }>('/api/me/profile', { headers });
  const items = useFetch<T[]>(`/api/${kind}`, { headers });

  const limit = computed(() => LIMIT_MAP[kind][(profile.data.value?.tier ?? 'free') as Tier]);
  const used = computed(() => items.data.value?.length ?? 0);
  const atLimit = computed(() => used.value >= limit.value);
  const pending = computed(() => profile.pending.value || items.pending.value);

  return { items: items.data, limit, used, atLimit, pending, refresh: items.refresh };
};
