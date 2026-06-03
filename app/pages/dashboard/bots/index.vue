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

const getInitial = (name: string | null) => (name ?? '?').charAt(0).toUpperCase();

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
        <DashboardBreadcrumb :items="[{ label: $t('__labelBot', 2) }]" />
      </template>
      <DashboardContainer>
        <div class="flex items-center justify-between gap-4">
          <h1 class="text-2xl font-semibold">
            {{ $t('__labelBot', 2) }} <span class="text-toned font-normal font-mono">({{ used }})</span>
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
                {{ $t('__actionConnectBot') }}
              </UButton>
            </UTooltip>
            <UButton
              v-else
              icon="i-lucide-plus"
              to="/dashboard/bots/new"
            >
              {{ $t('__actionConnectBot') }}
            </UButton>
          </template>
          <USkeleton
            v-else-if="pending"
            class="h-8 w-32 rounded-md bg-muted/60 shrink-0"
          />
        </div>

        <div class="flex flex-col gap-4">
          <UInput
            v-if="bots?.length"
            v-model.trim="search"
            icon="i-lucide-search"
            :placeholder="$t('__placeholderSearchBots')"
          >
            <template #trailing>
              <UButton
                v-if="search"
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-x"
                :aria-label="$t('__actionClearSearch')"
                @click="search = ''"
              />
            </template>
          </UInput>
          <USkeleton
            v-else-if="pending"
            class="h-8 w-full rounded-md bg-muted/40"
          />

          <DashboardListSkeleton v-if="pending && !bots?.length" />

          <UEmpty
            v-else-if="!bots?.length"
            variant="subtle"
            icon="i-lucide-bot"
            :title="$t('__titleBotsEmpty')"
            :description="$t('__descriptionBotsEmpty')"
            :actions="atLimit ? [] : [{ label: $t('__actionConnectFirstBot'), icon: 'i-lucide-plus', to: '/dashboard/bots/new' }]"
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
                <UTooltip :text="$t('__hintSyncAvatarFromLine')">
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
                        {{ getInitial(bot.displayName) }}
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
            {{ $t('__descriptionNoBotsMatchSearch', { query: search }) }}
          </p>
        </div>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
