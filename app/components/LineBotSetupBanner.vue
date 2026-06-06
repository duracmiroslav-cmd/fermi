<script setup lang="ts">
interface SetupBannerBot {
  id:             string;
  handle:         string | null;
  firstRepliedAt: string | null;
}

type CelebrationStage = 'idle' | 'success' | 'done';

const props = defineProps<{
  bot:                   SetupBannerBot;
  isOpenrouterConnected: boolean;
  isWebhookVerified:     boolean;
  isSetupComplete:       boolean;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const { t } = useI18n();
const notify = useNotify();

const webhookSettingUp = ref(false);
const celebrationStage = ref<CelebrationStage>('idle');

const hasFirstReplied = computed(() => !!props.bot.firstRepliedAt);

const friendAddUrl = computed(() =>
  props.bot.handle ? `https://line.me/R/ti/p/${props.bot.handle}` : null,
);
const qrImageUrl = computed(() => {
  if (!props.bot.handle) return null;
  const id = props.bot.handle.replace(/^@/, '');
  return `https://qr-official.line.me/sid/L/${id}.png`;
});

// Distinguish "bot just powered on while user is watching" from "page
// loaded with reply already in the DB", only the first deserves a
// celebration. Captures the snapshot at first bot fetch; later refetch
// transitions are compared against this baseline.
const wasPendingOnLoad = ref<boolean | null>(null);
watch(() => props.bot, (loaded) => {
  if (wasPendingOnLoad.value === null) {
    wasPendingOnLoad.value = !loaded.firstRepliedAt;
  }
}, { immediate: true });

watch(hasFirstReplied, (now, prev) => {
  if (now && !prev && wasPendingOnLoad.value === true) celebrate();
});

const setupWebhook = async () => {
  webhookSettingUp.value = true;
  try {
    await $fetch(`/api/bots/${props.bot.id}/webhook/endpoint`, { method: 'PUT' });
    const result = await $fetch<{
      success:     boolean;
      statusCode?: number;
      reason?:     string;
      detail?:     string;
    }>(`/api/bots/${props.bot.id}/webhook/test`, { method: 'POST' });
    if (!result.success) {
      notify.error(t('__toastWebhookTestFailed'), new Error(result.detail ?? result.reason ?? t('__errorUnknown')));
      return;
    }
    notify.success(t('__toastWebhookConnected'));
    emit('refresh');
  } catch (e) {
    notify.error(t('__toastWebhookSetupFailed'), e);
  } finally {
    webhookSettingUp.value = false;
  }
};

const celebrate = async () => {
  const { default: confetti } = await import('canvas-confetti');
  confetti({
    particleCount: 160,
    spread:        140,
    origin:        { y: 0.4 },
    colors:        ['#f48c6c', '#88bf68', '#ed9800', '#f03553'],
  });
  celebrationStage.value = 'success';
};

const dismissCelebration = () => {
  celebrationStage.value = 'done';
};
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-200 ease-out"
    enter-from-class="opacity-0"
    leave-active-class="transition-opacity duration-200 ease-in"
    leave-to-class="opacity-0"
    mode="out-in"
  >
    <UCard
      v-if="!hasFirstReplied && celebrationStage === 'idle'"
      key="checklist"
      :ui="{ root: 'ring-warning/30 bg-warning/10 divide-warning/20' }"
    >
      <template #header>
        <p class="font-medium flex items-center gap-3">
          <UIcon
            name="i-lucide-rocket"
            class="size-5 text-warning"
          />
          {{ $t('__titleFinishSetup') }}
        </p>
      </template>
      <ul class="flex flex-col gap-3">
        <li class="flex items-start gap-3">
          <UIcon
            :name="isOpenrouterConnected ? 'i-lucide-circle-check' : 'i-lucide-circle'"
            :class="['size-5 shrink-0', isOpenrouterConnected ? 'text-success' : 'text-toned']"
          />
          <div class="flex-1 min-w-0 flex flex-col gap-2">
            <p :class="['text-sm', isOpenrouterConnected && 'text-toned']">
              {{ $t('__titleConnectOpenrouter') }}
            </p>
            <p class="text-xs text-toned">
              {{ $t('__descriptionConnectOpenrouter') }}
            </p>
            <UButton
              v-if="!isOpenrouterConnected"
              size="sm"
              to="/api/oauth/openrouter/start"
              external
              target="_blank"
              rel="noopener"
              trailing-icon="i-lucide-external-link"
              class="self-start"
            >
              {{ $t('__actionSetupOpenrouter') }}
            </UButton>
          </div>
        </li>
        <li class="flex items-start gap-3">
          <UIcon
            :name="isWebhookVerified ? 'i-lucide-circle-check' : 'i-lucide-circle'"
            :class="['size-5 shrink-0', isWebhookVerified ? 'text-success' : 'text-toned']"
          />
          <div class="flex-1 min-w-0 flex flex-col gap-2">
            <p :class="['text-sm', isWebhookVerified && 'text-toned']">
              {{ $t('__titleConnectWebhook') }}
            </p>
            <p class="text-xs text-toned">
              {{ $t('__descriptionConnectWebhook') }}
            </p>
            <UButton
              v-if="!isWebhookVerified"
              size="sm"
              class="self-start"
              :loading="webhookSettingUp"
              :disabled="!isOpenrouterConnected"
              @click="setupWebhook"
            >
              {{ $t('__actionSetupWebhook') }}
            </UButton>
          </div>
        </li>
        <li class="flex items-start gap-3">
          <UIcon
            :name="isSetupComplete ? 'i-lucide-loader-circle' : 'i-lucide-circle'"
            :class="['size-5 shrink-0', isSetupComplete ? 'text-warning animate-spin' : 'text-toned']"
          />
          <div class="flex-1 min-w-0 flex items-start gap-4">
            <div class="flex-1 min-w-0 flex flex-col gap-2">
              <p class="text-sm">
                {{ $t('__titleSendTestMessage') }}
              </p>
              <p class="text-xs text-toned">
                {{ $t('__descriptionSendTestMessage') }}
              </p>
            </div>
            <a
              v-if="qrImageUrl && friendAddUrl"
              :href="friendAddUrl"
              target="_blank"
              rel="noopener"
              class="flex flex-col items-center gap-1 shrink-0"
            >
              <img
                :src="qrImageUrl"
                :alt="$t('__hintScanToAddBot')"
                class="size-24 rounded-md bg-white p-1"
              >
              <span class="text-xs">{{ $t('__labelScanToAdd') }}</span>
            </a>
          </div>
        </li>
      </ul>
    </UCard>

    <UCard
      v-else-if="celebrationStage === 'success'"
      key="success"
      :ui="{ root: 'ring-success/30 bg-success/10 divide-success/20' }"
    >
      <template #header>
        <div class="flex items-center justify-between gap-4">
          <p class="font-medium flex items-center gap-3">
            <UIcon
              name="i-lucide-party-popper"
              class="size-5 text-success"
            />
            {{ $t('__titleAllSet') }}
          </p>
          <UButton
            icon="i-lucide-x"
            size="sm"
            color="neutral"
            variant="link"
            :aria-label="$t('__actionDismiss')"
            @click="dismissCelebration"
          />
        </div>
      </template>
      <p class="text-sm text-toned">
        {{ $t('__descriptionBotIsLive') }}
      </p>
    </UCard>
  </Transition>
</template>
