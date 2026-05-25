<script setup lang="ts">
definePageMeta({ layout: false });

interface BotRow {
  id: string;
  platform: string;
  externalId: string;
  displayName: string | null;
  avatarUrl: string | null;
  agentId: string | null;
  disabledAt: string | null;
  createdAt: string;
  webhookUrl: string;
}

const { items: bots, used, atLimit, pending, refresh, limitMessage } = useTierLimit<BotRow>('bots');
const { syncingId, sync: syncAvatar } = useBotAvatar(refresh);

const initial = (name: string | null) => (name ?? '?').charAt(0).toUpperCase();

const search = ref('');
const filteredBots = computed(() => {
  const q = search.value.trim().toLowerCase();
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
      <template #actions>
        <UTooltip
          v-if="atLimit"
          :text="limitMessage"
        >
          <UButton
            icon="i-lucide-plus"
            disabled
          >
            New bot
          </UButton>
        </UTooltip>
        <UButton
          v-else
          icon="i-lucide-plus"
          to="/dashboard/bots/new"
        >
          New bot
        </UButton>
      </template>

      <DashboardContainer>
        <h1 class="text-2xl font-semibold">
          Bots <span class="text-dimmed font-normal">({{ used }})</span>
        </h1>

        <div class="flex flex-col gap-4">
          <UInput
            v-if="bots?.length"
            v-model="search"
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

          <div
            v-else-if="!bots?.length"
            class="border border-dashed border-default rounded-md py-16 px-6 text-center"
          >
            <p class="text-sm text-muted mb-2">
              No bots yet
            </p>
            <p class="text-sm text-dimmed mb-6 max-w-md mx-auto">
              A bot is a messaging channel registered in fermi. Add one, then attach an agent to bring it to life.
            </p>
            <UButton
              v-if="!atLimit"
              to="/dashboard/bots/new"
              icon="i-lucide-plus"
            >
              Create your first bot
            </UButton>
          </div>

          <div
            v-else-if="filteredBots.length"
            class="space-y-2"
          >
            <NuxtLink
              v-for="bot in filteredBots"
              :key="bot.id"
              :to="`/dashboard/bots/${bot.id}`"
              class="group flex items-center gap-4 p-4 rounded-md border border-muted hover:bg-muted transition-colors"
            >
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
                  class="relative size-9 shrink-0 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors group disabled:opacity-60 cursor-pointer"
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
              <div class="flex-1 min-w-0">
                <p class="font-medium truncate flex items-center gap-2">
                  {{ bot.displayName || '(unnamed)' }}
                  <span
                    v-if="bot.disabledAt"
                    class="text-sm text-muted normal-case"
                  >paused</span>
                </p>
                <p class="text-sm text-muted truncate mt-0.5">
                  {{ bot.platform }} · {{ bot.agentId ? 'bound' : 'no agent' }}
                </p>
              </div>
              <span class="text-sm text-muted shrink-0">
                <TimeAgo :date="bot.createdAt" />
              </span>
            </NuxtLink>
          </div>

          <p
            v-else
            class="text-sm text-muted text-center py-8"
          >
            No bots match "{{ search }}".
          </p>
        </div>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
