import { AGENT_LIMIT, BOT_LIMIT, type Tier } from '~~/shared/constants/tiers';

const LIMIT_MAP = {
  agents: AGENT_LIMIT,
  bots: BOT_LIMIT,
} as const;

export const useTierLimit = <T = unknown>(kind: 'agents' | 'bots') => {
  const profile = useProfile();
  const items = useFetch<T[]>(`/api/${kind}`, {
    headers: useRequestHeaders(['cookie']),
  });

  const tier = computed(() => (profile.value?.tier ?? 'free') as Tier);
  const limit = computed(() => LIMIT_MAP[kind][tier.value]);
  const used = computed(() => items.data.value?.length ?? 0);
  const atLimit = computed(() => used.value >= limit.value);
  const pending = computed(() => items.pending.value);
  const limitMessage = computed(() =>
    tier.value === 'free'
      ? `Free tier limit (${used.value}/${limit.value}) · upgrade`
      : `Plan limit reached (${used.value}/${limit.value})`,
  );

  return { items: items.data, tier, limit, used, atLimit, pending, limitMessage, refresh: items.refresh };
};
