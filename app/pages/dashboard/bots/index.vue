<script setup lang="ts">
interface BotRow {
  id: string;
  platform: string;
  externalId: string;
  displayName: string | null;
  agentId: string | null;
  enabled: boolean;
  allowGroups: boolean;
  createdAt: string;
  webhookUrl: string;
}

const { items: bots, limit, used, atLimit } = useTierLimit<BotRow>('bots');

const initial = (name: string | null) => (name ?? '?').charAt(0).toUpperCase();
</script>

<template>
  <NuxtLayout name="dashboard">
    <template #title>
      Bots
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
      <p class="font-mono text-xs text-dimmed mb-6">
        {{ used }} / {{ limit }} bots
      </p>

      <div
        v-if="!bots?.length"
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
            :text="initial(bot.displayName)"
            size="sm"
          />
          <div class="flex-1 min-w-0">
            <p class="font-medium truncate flex items-center gap-2">
              {{ bot.displayName || '(unnamed)' }}
              <span
                v-if="!bot.enabled"
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
