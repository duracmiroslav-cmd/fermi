<script setup lang="ts">
definePageMeta({ layout: false });

interface BotRow {
  id:                string;
  platform:          string;
  externalId:        string;
  displayName:       string | null;
  avatarUrl:         string | null;
  agentId:           string | null;
  disabledAt:        string | null;
  webhookVerifiedAt: string | null;
  createdAt:         string;
  webhookUrl:        string;
  agent:             { id: string; name: string; avatarUrl: string | null } | null;
  lastRepliedAt:     string | null;
}

const { items: bots, used, atLimit, pending, refresh, limitMessage } = useTierLimit<BotRow>('bots');
const { syncingId, sync: syncAvatar } = useBotAvatar(refresh);
const { data: openrouter, pending: openrouterPending } = useApiFetch<{ connected: boolean }>('/api/oauth/openrouter');

const initial = (name: string | null) => (name ?? '?').charAt(0).toUpperCase();

const statusOf = (bot: BotRow) => deriveBotStatus(
  bot,
  !!openrouter.value?.connected,
  openrouterPending.value && openrouter.value === undefined,
);
const statusDot = (bot: BotRow) => {
  const s = statusOf(bot);
  return s ? BOT_STATUS_DOT[s] : 'bg-muted animate-pulse';
};
const statusAria = (bot: BotRow) => {
  const s = statusOf(bot);
  return s ? BOT_STATUS_LABEL[s] : 'Loading status';
};

const search = ref('');
const filteredBots = computed(() => {
  const q = search.value.toLowerCase();
  if (!q) return bots.value ?? [];
  return (bots.value ?? []).filter(b => (b.displayName ?? '').toLowerCase().includes(q));
});
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb :items="[{ label: 'Bots' }]" />
      </template>
      <DashboardContainer>
        <div class="flex items-center justify-between gap-4">
          <h1 class="text-2xl font-semibold">
            Bots <span class="text-toned font-normal">({{ used }})</span>
          </h1>
          <template v-if="bots?.length">
            <UTooltip
              v-if="atLimit"
              :text="limitMessage"
            >
              <UButton
                icon="i-lucide-plus"
                disabled
              >
                Connect bot
              </UButton>
            </UTooltip>
            <UButton
              v-else
              icon="i-lucide-plus"
              to="/dashboard/bots/new"
            >
              Connect bot
            </UButton>
          </template>
        </div>

        <div class="flex flex-col gap-4">
          <UInput
            v-if="bots?.length"
            v-model.trim="search"
            icon="i-lucide-search"
            placeholder="Search bots..."
          >
            <template #trailing>
              <UButton
                v-if="search"
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-x"
                aria-label="Clear search"
                @click="search = ''"
              />
            </template>
          </UInput>

          <DashboardListSkeleton
            v-if="pending && !bots?.length"
            :rows="3"
          />

          <UEmpty
            v-else-if="!bots?.length"
            variant="subtle"
            icon="i-lucide-bot"
            title="No bots yet"
            description="A bot is a messaging channel registered in fermi. Add one, then attach an agent to bring it to life."
            :actions="atLimit ? [] : [{ label: 'Connect your first bot', icon: 'i-lucide-plus', to: '/dashboard/bots/new' }]"
          />

          <div
            v-else-if="filteredBots.length"
            class="space-y-2"
          >
            <NuxtLink
              v-for="bot in filteredBots"
              :key="bot.id"
              :to="`/dashboard/bots/${bot.id}`"
              class="block"
            >
              <UCard class="hover:bg-elevated transition-colors">
                <div class="flex items-center gap-4">
                  <div class="relative shrink-0">
                    <UAvatar
                      v-if="bot.avatarUrl"
                      :src="bot.avatarUrl"
                      :text="initial(bot.displayName)"
                      size="lg"
                    />
                    <UTooltip
                      v-else
                      text="Sync avatar from LINE"
                    >
                      <button
                        type="button"
                        :disabled="syncingId === bot.id"
                        class="relative size-9 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors group disabled:opacity-60 cursor-pointer"
                        @click.stop.prevent="syncAvatar(bot.id)"
                      >
                        <UIcon
                          v-if="syncingId === bot.id"
                          name="i-lucide-loader-circle"
                          class="absolute inset-0 m-auto size-4 text-primary animate-spin"
                        />
                        <template v-else>
                          <span class="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold text-primary transition-opacity group-hover:opacity-0">
                            {{ initial(bot.displayName) }}
                          </span>
                          <UIcon
                            name="i-lucide-refresh-cw"
                            class="absolute inset-0 m-auto size-3.5 text-primary opacity-0 transition-opacity group-hover:opacity-100"
                          />
                        </template>
                      </button>
                    </UTooltip>
                    <span
                      class="absolute bottom-0 right-0 size-3 rounded-full ring-2 ring-default"
                      :class="statusDot(bot)"
                      :aria-label="statusAria(bot)"
                    />
                  </div>
                  <div class="flex-1 min-w-0 flex flex-col gap-0.5">
                    <p class="font-medium truncate">
                      {{ bot.displayName || '(unnamed)' }}
                    </p>
                    <div class="flex items-center gap-3 min-w-0 text-sm text-toned">
                      <span class="inline-flex items-center gap-1.5 min-w-0">
                        <AgentAvatar
                          v-if="bot.agent"
                          :src="bot.agent.avatarUrl"
                          :name="bot.agent.name"
                          :seed="bot.agent.id"
                          size="2xs"
                        />
                        <span class="truncate">{{ bot.agent?.name ?? 'No agent' }}</span>
                      </span>
                      <PlatformLabel
                        :platform="bot.platform"
                        class="shrink-0"
                      />
                    </div>
                  </div>
                  <span
                    v-if="bot.lastRepliedAt"
                    class="text-xs text-toned shrink-0"
                  >
                    Replied <TimeAgo :date="bot.lastRepliedAt" />
                  </span>
                  <span
                    v-else
                    class="text-xs text-toned shrink-0"
                  >
                    No replies yet
                  </span>
                </div>
              </UCard>
            </NuxtLink>
          </div>

          <p
            v-else
            class="text-sm text-toned text-center py-8"
          >
            No bots match "{{ search }}".
          </p>
        </div>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
