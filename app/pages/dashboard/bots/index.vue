<script setup lang="ts">
interface BotRow {
  id: string;
  platform: string;
  externalId: string;
  displayName: string | null;
  avatarUrl: string | null;
  agentId: string | null;
  disabledAt: string | null;
  allowGroups: boolean;
  createdAt: string;
  webhookUrl: string;
}

const { items: bots, limit, used, atLimit, pending, refresh } = useTierLimit<BotRow>('bots');
const { syncingId, sync: syncAvatar } = useBotAvatar(refresh);

const initial = (name: string | null) => (name ?? '?').charAt(0).toUpperCase();
</script>

<template>
  <NuxtLayout name="dashboard">
    <template #title>
      Bots <span class="text-dimmed">({{ used }} / {{ limit }})</span>
    </template>
    <template #actions>
      <UTooltip
        v-if="atLimit"
        :text="`Free tier limit (${used}/${limit}) · upgrade`"
      >
        <UButton
          icon="i-lucide-plus"
          size="sm"
          disabled
        >
          Connect bot
        </UButton>
      </UTooltip>
      <UButton
        v-else
        icon="i-lucide-plus"
        size="sm"
        to="/dashboard/bots/new"
      >
        Connect bot
      </UButton>
    </template>

    <div class="p-6 sm:p-8">
      <DashboardListSkeleton
        v-if="pending && !bots?.length"
        :rows="3"
      />

      <div
        v-else-if="!bots?.length"
        class="border border-dashed border-default rounded-md py-16 px-6 text-center"
      >
        <p class="font-mono text-sm text-muted mb-2">
          No bots connected
        </p>
        <p class="text-sm text-dimmed mb-6 max-w-md mx-auto">
          A bot is your LINE channel registered in fermi. Connect one with its Channel Secret + Access Token, then attach an agent to bring it to life.
        </p>
        <UButton
          v-if="!atLimit"
          to="/dashboard/bots/new"
          icon="i-lucide-plus"
        >
          Connect your first bot
        </UButton>
      </div>

      <div
        v-else
        class="space-y-2 max-w-3xl"
      >
        <NuxtLink
          v-for="bot in bots"
          :key="bot.id"
          :to="`/dashboard/bots/${bot.id}`"
          class="group flex items-center gap-4 p-4 rounded-md border border-default hover:bg-muted/30 transition-colors"
        >
          <UAvatar
            v-if="bot.avatarUrl"
            :src="bot.avatarUrl"
            :text="initial(bot.displayName)"
            size="sm"
          />
          <UTooltip
            v-else
            text="Sync avatar from LINE"
          >
            <button
              type="button"
              :disabled="syncingId === bot.id"
              class="relative size-8 shrink-0 rounded-full bg-primary/10 border border-primary/30 hover:bg-primary/20 hover:border-primary/50 transition-colors group disabled:opacity-60 cursor-pointer"
              @click.stop.prevent="syncAvatar(bot.id)"
            >
              <UIcon
                v-if="syncingId === bot.id"
                name="i-lucide-loader-circle"
                class="absolute inset-0 m-auto size-4 text-primary animate-spin"
              />
              <template v-else>
                <span
                  class="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold text-primary transition-opacity group-hover:opacity-0"
                >
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
                class="font-mono text-xs text-dimmed normal-case"
              >paused</span>
            </p>
            <p class="font-mono text-xs text-dimmed truncate mt-0.5">
              {{ bot.platform }} · {{ bot.agentId ? 'bound' : 'no agent' }}
            </p>
          </div>
          <span class="font-mono text-xs text-dimmed shrink-0">
            {{ relativeTime(bot.createdAt) }}
          </span>
        </NuxtLink>
      </div>
    </div>
  </NuxtLayout>
</template>
