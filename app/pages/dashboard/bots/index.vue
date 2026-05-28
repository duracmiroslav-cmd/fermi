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

const initial = (name: string | null) => (name ?? '?').charAt(0).toUpperCase();

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
            <BotListCard
              v-for="bot in filteredBots"
              :key="bot.id"
              :bot="bot"
            >
              <template #avatar-fallback>
                <UTooltip text="Sync avatar from LINE">
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
              </template>
            </BotListCard>
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
