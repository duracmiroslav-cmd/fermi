<script setup lang="ts">
definePageMeta({ layout: false });

interface BotDetail {
  id:                string;
  platform:          string;
  externalId:        string;
  handle:            string | null;
  displayName:       string | null;
  avatarUrl:         string | null;
  agentId:           string;
  disabledAt:        string | null;
  webhookVerifiedAt: string | null;
  firstRepliedAt:    string | null;
  createdAt:         string;
  updatedAt:         string;
  webhookUrl:        string;
  agent: {
    id:               string;
    name:             string;
    avatarUrl:        string | null;
    defaultTextModel: string | null;
    isDefault:        boolean;
    updatedAt:        string;
  };
}

const route = useRoute();

const { data: bot, error, refresh, pending } = useApiFetch<BotDetail>(
  () => `/api/bots/${route.params.id}`,
  { key: route.params.id as string },
);
const {
  status,
  isOpenrouterConnected,
  isWebhookVerified,
  isSetupComplete,
  refreshOpenrouter,
} = useBotStatus(bot);

const { syncingId, sync: syncFromLine } = useBotAvatar(refresh);

const webhookCopied = ref(false);

const syncing = computed(() => syncingId.value !== null);

const isBotActive = computed(() => !!bot.value && !bot.value.disabledAt);
const hasFirstReplied = computed(() => !!bot.value?.firstRepliedAt);

// Poll OpenRouter status while not yet connected. OAuth runs in a
// separate tab with no callback to this one, so polling is how we
// surface the change here. Stop once connected.
const openrouterPoll = useIntervalFn(() => refreshOpenrouter(), 4000, { immediate: false });
watchEffect(() => {
  const shouldPoll = !isOpenrouterConnected.value;
  if (shouldPoll && !openrouterPoll.isActive.value) openrouterPoll.resume();
  if (!shouldPoll && openrouterPoll.isActive.value) openrouterPoll.pause();
});

// Poll bot detail while setup is complete but we're still waiting for
// the first reply. `firstRepliedAt` is derived from agent_runs, so it
// flips as soon as the worker logs a succeeded run; polling just surfaces
// it to the UI. Stop once detected (or if the bot is paused, since a
// paused bot never pushes).
const firstReplyPoll = useIntervalFn(() => refresh(), 4000, { immediate: false });
watchEffect(() => {
  const shouldPoll = isBotActive.value && isSetupComplete.value && !hasFirstReplied.value;
  if (shouldPoll && !firstReplyPoll.isActive.value) firstReplyPoll.resume();
  if (!shouldPoll && firstReplyPoll.isActive.value) firstReplyPoll.pause();
});

const copyWebhook = async () => {
  if (!bot.value) return;
  await navigator.clipboard.writeText(bot.value.webhookUrl);
  webhookCopied.value = true;
  setTimeout(() => {
    webhookCopied.value = false;
  }, 1500);
};
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

      <DashboardDetailSkeleton v-if="pending && !bot" />

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

        <LineBotSetupBanner
          v-if="status && status !== 'paused'"
          :bot="bot"
          :is-openrouter-connected="isOpenrouterConnected"
          :is-webhook-verified="isWebhookVerified"
          :is-setup-complete="isSetupComplete"
          @refresh="refresh"
        />

        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-semibold">
              Details
            </h2>
            <UButton
              :to="`/dashboard/bots/${bot.id}/edit`"
              icon="i-lucide-square-pen"
              color="neutral"
              variant="soft"
              size="sm"
            >
              Edit
            </UButton>
          </div>
          <UCard>
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm leading-7">
              <dt class="text-toned text-right">
                External ID
              </dt>
              <dd class="break-all">
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
                    size="2xs"
                  />
                  <NuxtLink
                    :to="`/dashboard/agents/${bot.agent.id}`"
                    target="_blank"
                    rel="noopener"
                    class="flex items-center gap-1.5 min-w-0 text-primary hover:underline"
                  >
                    <span class="truncate">{{ bot.agent.name }}</span>
                    <UIcon
                      name="i-lucide-external-link"
                      class="size-3.5 shrink-0 text-toned"
                    />
                  </NuxtLink>
                </div>
              </dd>
              <dt class="text-toned text-right">
                Webhook URL
              </dt>
              <dd class="flex items-center gap-1.5 min-w-0">
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
              <dd>
                <TimeAgo :date="bot.createdAt" />
              </dd>
              <dt class="text-toned text-right">
                Updated
              </dt>
              <dd>
                <TimeAgo :date="bot.updatedAt" />
              </dd>
            </dl>
          </UCard>
        </div>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
