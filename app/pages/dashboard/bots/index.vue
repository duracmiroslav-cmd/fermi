<script setup lang="ts">
import { BOT_LIMIT, type Tier } from '~~/shared/constants/tiers';

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

interface ProfileShape {
  tier: Tier;
}

const { data: profile } = await useFetch<ProfileShape>('/api/me/profile', {
  headers: useRequestHeaders(['cookie']),
});
const { data: bots } = await useFetch<BotRow[]>('/api/bots', {
  headers: useRequestHeaders(['cookie']),
});

const limit = computed(() => BOT_LIMIT[(profile.value?.tier ?? 'free') as Tier]);
const used = computed(() => bots.value?.length ?? 0);
const atLimit = computed(() => used.value >= limit.value);

const initial = (name: string | null) => (name ?? '?').charAt(0).toUpperCase();

const relativeTime = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};
</script>

<template>
  <NuxtLayout name="dashboard">
    <template #title>
      bots
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
          connect bot
        </UButton>
      </UTooltip>
      <UButton
        v-else
        icon="i-lucide-plus"
        size="sm"
        to="/dashboard/bots/new"
      >
        connect bot
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
          no bots connected
        </p>
        <p class="text-sm text-dimmed mb-6 max-w-md mx-auto">
          A bot is your LINE channel registered in fermi. Connect one with its Channel Secret + Access Token, then attach an agent to bring it to life.
        </p>
        <UButton
          v-if="!atLimit"
          to="/dashboard/bots/new"
          icon="i-lucide-plus"
        >
          connect your first bot
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
