<script setup lang="ts">
interface BotAgent {
  id:        string;
  name:      string;
  avatarUrl: string | null;
}

interface Bot {
  id:                string;
  displayName:       string | null;
  platform:          string;
  avatarUrl:         string | null;
  disabledAt:        string | null;
  webhookVerifiedAt: string | null;
  lastRepliedAt:     string | null;
  // `agent` is opt-in: bot list passes it (with optional null for "No agent"),
  // agent-scoped lists omit it because the agent is the page's own context.
  agent?:            BotAgent | null;
}

const props = defineProps<{
  bot: Bot;
}>();

// Status derives from bot fields + global OpenRouter connection state.
// Each card fetches /api/oauth/openrouter via useBotStatus; Nuxt dedupes
// by URL, so N cards share one fetch.
const botRef = computed(() => props.bot);
const { status } = useBotStatus(botRef);

const statusDot = computed(() =>
  status.value ? BOT_STATUS_DOT[status.value] : 'bg-muted animate-pulse',
);
const statusAria = computed(() =>
  status.value ? BOT_STATUS_LABEL[status.value] : 'Loading status',
);
</script>

<template>
  <NuxtLink
    :to="`/dashboard/bots/${bot.id}`"
    class="block"
  >
    <UCard class="hover:bg-elevated transition-colors">
      <div class="flex items-center gap-4">
        <div class="relative shrink-0">
          <UAvatar
            v-if="bot.avatarUrl"
            :src="bot.avatarUrl"
            size="lg"
          />
          <slot
            v-else
            name="avatar-fallback"
          >
            <div class="size-9 rounded-full bg-primary/10 flex items-center justify-center font-mono text-sm font-semibold text-primary">
              {{ (bot.displayName ?? '?').charAt(0).toUpperCase() }}
            </div>
          </slot>
          <span
            class="absolute bottom-0 right-0 size-3 rounded-full ring-2 ring-default"
            :class="statusDot"
            :aria-label="statusAria"
          />
        </div>
        <div class="flex-1 min-w-0 flex flex-col gap-0.5">
          <p class="font-medium truncate">
            {{ bot.displayName || '(unnamed)' }}
          </p>
          <div class="flex items-center gap-3 min-w-0 text-sm text-toned">
            <span
              v-if="bot.agent !== undefined"
              class="inline-flex items-center gap-1.5 min-w-0"
            >
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
</template>
