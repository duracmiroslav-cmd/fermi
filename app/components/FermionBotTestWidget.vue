<script setup lang="ts">
interface BotInfo {
  handle:         string | null;
  displayName:    string | null;
  firstRepliedAt: string | null;
}

const props = defineProps<{ botId: string }>();
// fermion continues the conversation once the bot's first reply lands.
const emit = defineEmits<{ replied: [] }>();

const { data: bot, refresh } = useApiFetch<BotInfo>(() => `/api/bots/${props.botId}`);

const hasReplied = computed(() => !!bot.value?.firstRepliedAt);

// Poll the bot until its first reply is detected (firstRepliedAt derives
// from agent_runs, so it flips as soon as the worker logs a succeeded run).
const poll = useIntervalFn(() => refresh(), 4000, { immediate: true });

const celebrate = async () => {
  const { default: confetti } = await import('canvas-confetti');
  confetti({
    particleCount: 160,
    spread:        140,
    origin:        { y: 0.4 },
    colors:        ['#f48c6c', '#88bf68', '#ed9800', '#f03553'],
  });
};

// `watch` (not immediate) only fires on the transition, so confetti goes
// off when the reply lands while the owner is watching — not if the widget
// mounts with a reply already in the DB.
watch(hasReplied, (replied) => {
  if (!replied) return;
  poll.pause();
  celebrate();
  emit('replied');
});
</script>

<template>
  <UCard class="w-full max-w-md">
    <div
      v-if="hasReplied"
      class="flex items-center gap-2 text-sm"
    >
      <UIcon
        name="i-lucide-party-popper"
        class="size-5 text-primary"
      />
      {{ $t('__labelFermionBotReplied') }}
    </div>
    <div
      v-else
      class="flex flex-col items-center gap-3 text-center"
    >
      <p class="text-sm text-toned">
        {{ $t('__descriptionFermionBotTest') }}
      </p>
      <LineBotAddQr :handle="bot?.handle ?? null" />
      <p class="flex items-center gap-1.5 text-xs text-toned">
        <UIcon
          name="i-lucide-loader-circle"
          class="size-3.5 animate-spin"
        />
        {{ $t('__hintFermionWaitingReply') }}
      </p>
    </div>
  </UCard>
</template>
