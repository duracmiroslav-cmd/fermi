<script setup lang="ts">
definePageMeta({ layout: false });

interface BotDetail {
  id: string;
  platform: string;
  externalId: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  agentId: string;
  disabledAt: string | null;
  webhookVerifiedAt: string | null;
  firstRepliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  webhookUrl: string;
  agent: {
    id: string;
    name: string;
    avatarUrl: string | null;
    defaultTextModel: string | null;
    isDefault: boolean;
    updatedAt: string;
  };
}

type CelebrationStage = 'idle' | 'flash' | 'success' | 'done';

const route = useRoute();
const notify = useNotify();

const { data: bot, error, refresh, pending } = useApiFetch<BotDetail>(
  () => `/api/bots/${route.params.id}`,
);
const { status, openrouterPending, isOpenrouterConnected } = useBotStatus(bot);

const { syncingId, sync: syncFromLine } = useBotAvatar(refresh);

const webhookCopied = ref(false);
const webhookSettingUp = ref(false);
const celebrationStage = ref<CelebrationStage>('idle');
const celebrationTimeouts: ReturnType<typeof setTimeout>[] = [];

const syncing = computed(() => syncingId.value !== null);

const isWebhookVerified = computed(() => !!bot.value?.webhookVerifiedAt);
const isSetupComplete = computed(() => isOpenrouterConnected.value && isWebhookVerified.value);
const hasFirstReplied = computed(() => !!bot.value?.firstRepliedAt);

const friendAddUrl = computed(() =>
  bot.value?.handle ? `https://line.me/R/ti/p/${bot.value.handle}` : null,
);
const qrImageUrl = computed(() => {
  if (!bot.value?.handle) return null;
  const id = bot.value.handle.replace(/^@/, '');
  return `https://qr-official.line.me/sid/L/${id}.png`;
});

// Poll bot detail while setup is complete but we're still waiting for
// the first reply. The worker writes `first_replied_at` after a
// successful push, so polling is just to surface that to the UI. Stop
// once detected (or if setup regresses, e.g. user disables the bot).
const firstReplyPoll = useIntervalFn(() => refresh(), 4000, { immediate: false });
watchEffect(() => {
  const shouldPoll = isSetupComplete.value && !hasFirstReplied.value;
  if (shouldPoll && !firstReplyPoll.isActive.value) firstReplyPoll.resume();
  if (!shouldPoll && firstReplyPoll.isActive.value) firstReplyPoll.pause();
});

// Distinguish "bot just powered on while user is watching" from "page
// loaded with reply already in the DB" — only the first deserves a
// celebration. Captures the snapshot at first bot fetch; later refetch
// transitions are compared against this baseline.
const wasPendingOnLoad = ref<boolean | null>(null);
watch(bot, (loaded) => {
  if (loaded && wasPendingOnLoad.value === null) {
    wasPendingOnLoad.value = !loaded.firstRepliedAt;
  }
}, { immediate: true });

watch(hasFirstReplied, (now, prev) => {
  if (now && !prev && wasPendingOnLoad.value === true) celebrate();
});

const copyWebhook = async () => {
  if (!bot.value) return;
  await navigator.clipboard.writeText(bot.value.webhookUrl);
  webhookCopied.value = true;
  setTimeout(() => {
    webhookCopied.value = false;
  }, 1500);
};

const setupWebhook = async () => {
  if (!bot.value) return;
  webhookSettingUp.value = true;
  try {
    await $fetch(`/api/bots/${bot.value.id}/webhook/endpoint`, { method: 'PUT' });
    const result = await $fetch<{
      success: boolean;
      statusCode?: number;
      reason?: string;
      detail?: string;
    }>(`/api/bots/${bot.value.id}/webhook/test`, { method: 'POST' });
    if (!result.success) {
      notify.error('Webhook test failed', new Error(result.detail ?? result.reason ?? 'Unknown error'));
      return;
    }
    notify.success('Webhook connected');
    await refresh();
  } catch (e) {
    notify.error('Webhook setup failed', e);
  } finally {
    webhookSettingUp.value = false;
  }
};

const celebrate = async () => {
  if (!bot.value) return;
  celebrationStage.value = 'flash';

  const { default: confetti } = await import('canvas-confetti');
  celebrationTimeouts.push(setTimeout(() => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.4 },
      colors: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899'],
    });
    celebrationStage.value = 'success';
  }, 400));
};

const dismissCelebration = () => {
  celebrationStage.value = 'done';
};

onBeforeUnmount(() => {
  celebrationTimeouts.forEach(clearTimeout);
  celebrationTimeouts.length = 0;
});
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb
          :items="[
            { label: 'Bots', to: '/dashboard/bots' },
            { label: bot?.displayName ?? '' },
          ]"
          :loading="!bot"
        />
      </template>

      <DashboardDetailSkeleton
        v-if="pending && !bot"
        :fields="2"
      />

      <DashboardContainer v-else-if="error">
        <UEmpty
          variant="subtle"
          icon="i-lucide-search-x"
          title="Bot not found"
          description="This bot may have been deleted, or the link is wrong."
          :actions="[{ label: 'Back to bots', icon: 'i-lucide-arrow-left', to: '/dashboard/bots' }]"
        />
      </DashboardContainer>

      <DashboardContainer v-if="bot">
        <div class="flex items-center gap-4">
          <div class="relative shrink-0">
            <UAvatar
              v-if="bot.avatarUrl"
              :src="bot.avatarUrl"
              size="3xl"
            />
            <UTooltip
              v-else
              text="Sync avatar from LINE"
            >
              <button
                type="button"
                :disabled="syncing"
                class="relative size-12 shrink-0 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors group disabled:opacity-60 cursor-pointer"
                @click.stop.prevent="syncFromLine(bot.id)"
              >
                <UIcon
                  v-if="syncing"
                  name="i-lucide-loader-circle"
                  class="absolute inset-0 m-auto size-5 text-primary animate-spin"
                />
                <template v-else>
                  <span class="absolute inset-0 flex items-center justify-center font-mono text-xl font-semibold text-primary transition-opacity group-hover:opacity-0">
                    {{ (bot.displayName ?? '?').charAt(0).toUpperCase() }}
                  </span>
                  <UIcon
                    name="i-lucide-refresh-cw"
                    class="absolute inset-0 m-auto size-5 text-primary opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </template>
              </button>
            </UTooltip>
            <span
              class="absolute bottom-0 right-0 size-3 rounded-full ring-2 ring-default"
              :class="status ? BOT_STATUS_DOT[status] : 'bg-muted animate-pulse'"
              :aria-label="status ? BOT_STATUS_LABEL[status] : 'Loading status'"
            />
          </div>
          <div class="min-w-0">
            <h1 class="text-2xl font-semibold truncate">
              {{ bot.displayName || '(unnamed)' }}
            </h1>
            <p class="text-sm text-toned mt-1">
              {{ status ? BOT_STATUS_LABEL[status] : '' }}
            </p>
          </div>
        </div>

        <Transition
          enter-active-class="transition-opacity duration-200 ease-out"
          enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-200 ease-in"
          leave-to-class="opacity-0"
          mode="out-in"
        >
          <div
            v-if="!openrouterPending && !isSetupComplete && !bot.disabledAt"
            key="checklist"
            class="p-4 rounded-md ring ring-inset ring-warning/40 bg-warning/5"
          >
            <p class="text-base font-medium text-warning flex items-center gap-3 mb-5">
              <UIcon
                name="i-lucide-circle-alert"
                class="size-5"
              />
              Finish setting up
            </p>
            <ul class="flex flex-col gap-3">
              <li class="flex items-start gap-3">
                <UIcon
                  :name="isOpenrouterConnected ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                  :class="['size-5 mt-0.5 shrink-0', isOpenrouterConnected ? 'text-success' : 'text-toned']"
                />
                <div class="flex-1 min-w-0">
                  <p :class="['text-sm', isOpenrouterConnected && 'text-toned']">
                    Connect OpenRouter
                  </p>
                  <p class="text-xs text-toned mt-1">
                    Bots reply through OpenRouter. One signup unlocks Claude, GPT, Gemini, and 200+ other LLMs.
                  </p>
                  <UButton
                    v-if="!isOpenrouterConnected"
                    size="sm"
                    to="/dashboard/connections"
                    trailing-icon="i-lucide-arrow-right"
                    class="mt-2"
                  >
                    Go to Connections
                  </UButton>
                </div>
              </li>
              <li class="flex items-start gap-3">
                <UIcon
                  :name="isWebhookVerified ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                  :class="['size-5 mt-0.5 shrink-0', isWebhookVerified ? 'text-success' : 'text-toned']"
                />
                <div class="flex-1 min-w-0">
                  <p :class="['text-sm', isWebhookVerified && 'text-toned']">
                    Connect webhook to LINE
                  </p>
                  <p class="text-xs text-toned mt-1">
                    fermi pushes the webhook URL to your LINE channel and runs a verify request. No need to touch LINE Developer Console.
                  </p>
                  <UButton
                    v-if="!isWebhookVerified"
                    size="sm"
                    class="mt-2"
                    :loading="webhookSettingUp"
                    :disabled="!isOpenrouterConnected"
                    @click="setupWebhook"
                  >
                    Set up webhook
                  </UButton>
                </div>
              </li>
            </ul>
          </div>

          <div
            v-else-if="isSetupComplete && !hasFirstReplied && (celebrationStage === 'idle' || celebrationStage === 'flash')"
            key="ready"
            :class="['flex items-start gap-4 p-4 rounded-md ring ring-inset transition-colors duration-700',
                     celebrationStage === 'flash'
                       ? 'ring-success/60 bg-success/20'
                       : 'ring-success/40 bg-success/5']"
          >
            <div class="flex-1 min-w-0">
              <p class="text-base font-medium text-success flex items-center gap-3">
                <UIcon
                  name="i-lucide-circle-check"
                  class="size-5"
                />
                Setup complete
              </p>
              <p class="text-sm text-toned mt-1">
                Add the bot on LINE and send it a message. fermi will celebrate the first reply.
              </p>
              <p class="text-xs text-toned mt-3 flex items-center gap-2">
                <UIcon
                  name="i-lucide-loader-circle"
                  class="size-3.5 animate-spin"
                />
                Listening for the first reply...
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
                alt="Scan to add bot on LINE"
                class="size-24 rounded-md bg-white p-1"
              >
              <span class="text-xs text-toned">Scan to add</span>
            </a>
          </div>

          <div
            v-else-if="celebrationStage === 'success'"
            key="success"
            class="p-4 rounded-md ring ring-inset ring-success/40 bg-success/5"
          >
            <div class="flex items-start justify-between gap-3">
              <p class="text-base font-medium flex items-center gap-3">
                <UIcon
                  name="i-lucide-party-popper"
                  class="size-5 text-success"
                />
                You&apos;re all set
              </p>
              <UButton
                icon="i-lucide-x"
                size="sm"
                color="neutral"
                variant="ghost"
                aria-label="Dismiss"
                @click="dismissCelebration"
              />
            </div>
            <p class="text-sm text-toned mt-1">
              Your bot is live and replying.
            </p>
          </div>
        </Transition>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <p class="font-medium">
                Details
              </p>
              <UButton
                :to="`/dashboard/bots/${bot.id}/edit`"
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="sm"
              >
                Edit
              </UButton>
            </div>
          </template>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm leading-7">
            <dt class="text-toned text-right">
              External ID
            </dt>
            <dd class="text-highlighted break-all">
              {{ bot.externalId }}
            </dd>
            <dt class="text-toned text-right">
              Agent
            </dt>
            <dd class="min-w-0">
              <div class="flex items-center gap-1.5 min-w-0">
                <AgentAvatar
                  :src="bot.agent.avatarUrl"
                  :name="bot.agent.name"
                  :seed="bot.agent.id"
                  size="sm"
                />
                <NuxtLink
                  :to="`/dashboard/agents/${bot.agent.id}`"
                  class="truncate min-w-0 text-primary hover:underline"
                >
                  {{ bot.agent.name }}
                </NuxtLink>
              </div>
            </dd>
            <dt class="text-toned text-right">
              Webhook URL
            </dt>
            <dd class="text-highlighted flex items-center gap-1.5 min-w-0">
              <code class="font-mono truncate select-all">{{ bot.webhookUrl }}</code>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                :icon="webhookCopied ? 'i-lucide-check' : 'i-lucide-copy'"
                :aria-label="webhookCopied ? 'Copied' : 'Copy webhook URL'"
                @click="copyWebhook"
              />
            </dd>
            <dt class="text-toned text-right">
              Created
            </dt>
            <dd class="text-highlighted">
              <TimeAgo :date="bot.createdAt" />
            </dd>
            <dt class="text-toned text-right">
              Updated
            </dt>
            <dd class="text-highlighted">
              <TimeAgo :date="bot.updatedAt" />
            </dd>
          </dl>
        </UCard>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
