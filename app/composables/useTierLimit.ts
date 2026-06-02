import { AGENT_LIMIT, BOT_LIMIT, type Tier } from '~~/shared/constants/tiers';

const LIMIT_MAP = {
  agents: AGENT_LIMIT,
  bots:   BOT_LIMIT,
} as const;

export const useTierLimit = <T = unknown>(kind: 'agents' | 'bots') => {
  const { t } = useI18n();
  const profile = useProfile();
  // Explicit key (the bare kind) so create/delete sites can invalidate this
  // list via refreshNuxtData(kind) before navigating back, avoiding a stale
  // flash. Mirrors the detail pages' `key: id` + refreshNuxtData(id) pattern.
  const items = useFetch<T[]>(`/api/${kind}`, {
    key:     kind,
    headers: useRequestHeaders(['cookie']),
  });

  const tier = computed(() => (profile.value?.tier ?? 'free') as Tier);
  const limit = computed(() => LIMIT_MAP[kind][tier.value]);
  const used = computed(() => items.data.value?.length ?? 0);
  const atLimit = computed(() => used.value >= limit.value);
  const pending = computed(() => items.pending.value);
  const limitMessage = computed(() => {
    const params = { used: used.value, limit: limit.value };
    return tier.value === 'free'
      ? t('__hintFreeTierLimit', params)
      : t('__hintPlanLimitReached', params);
  });

  return { items: items.data, tier, limit, used, atLimit, pending, limitMessage, refresh: items.refresh };
};
