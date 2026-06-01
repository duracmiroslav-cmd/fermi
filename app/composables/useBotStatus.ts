import type { Ref } from 'vue';

// Single source of truth for a bot's status across the list, detail, and
// edit surfaces, so the wording never drifts (e.g. "Ready" vs "Active").
export type BotStatus = 'ready' | 'paused' | 'unconfigured';

// Maps status to an i18n key. Call sites resolve via $t() so the
// rendered string stays locale-aware.
export const BOT_STATUS_LABEL_KEY: Record<BotStatus, string> = {
  ready:        '__statusReady',
  paused:       '__statusPaused',
  unconfigured: '__statusNeedsSetup',
};

export const BOT_STATUS_DOT: Record<BotStatus, string> = {
  ready:        'bg-success',
  paused:       'bg-muted',
  unconfigured: 'bg-warning',
};

interface StatusBot {
  disabledAt:        string | null;
  webhookVerifiedAt: string | null;
}

// Pure derivation shared by the list, detail, and edit surfaces so the
// criteria never drift. `null` means the inputs are still resolving: the
// ready/needs-setup split depends on the OpenRouter connector (a
// separate request), and on navigation the bot is often cached while
// OpenRouter is still loading, so deciding eagerly would flash a false
// "Needs setup" before settling. Callers render a neutral placeholder
// while status is null.
export const deriveBotStatus = (
  bot: StatusBot | null | undefined,
  openrouterConnected: boolean,
  openrouterLoading: boolean,
): BotStatus | null => {
  if (!bot) return null;
  if (bot.disabledAt) return 'paused';
  if (openrouterLoading) return null;
  return openrouterConnected && !!bot.webhookVerifiedAt ? 'ready' : 'unconfigured';
};

export const useBotStatus = (bot: Ref<StatusBot | null | undefined>) => {
  const {
    data: openrouter,
    pending: openrouterPending,
    refresh: refreshOpenrouter,
  } = useApiFetch<{ connected: boolean }>('/api/oauth/openrouter');

  const isOpenrouterConnected = computed(() => !!openrouter.value?.connected);
  const isWebhookVerified = computed(() => !!bot.value?.webhookVerifiedAt);
  const isSetupComplete = computed(() => isOpenrouterConnected.value && isWebhookVerified.value);

  const status = computed<BotStatus | null>(() => deriveBotStatus(
    bot.value,
    isOpenrouterConnected.value,
    openrouterPending.value && openrouter.value === undefined,
  ));

  return {
    status,
    openrouter,
    openrouterPending,
    isOpenrouterConnected,
    isWebhookVerified,
    isSetupComplete,
    refreshOpenrouter,
  };
};
