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
const friendAddUrl = computed(() =>
  bot.value?.handle ? `https://line.me/R/ti/p/${bot.value.handle}` : null,
);
const qrImageUrl = computed(() => {
  if (!bot.value?.handle) return null;
  return `https://qr-official.line.me/sid/L/${bot.value.handle.replace(/^@/, '')}.png`;
});

// Poll the bot until its first reply is detected (firstRepliedAt derives
// from agent_runs, so it flips as soon as the worker logs a succeeded run).
const poll = useIntervalFn(() => refresh(), 4000, { immediate: true });

watch(hasReplied, (replied) => {
  if (!replied) return;
  poll.pause();
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
      <img
        v-if="qrImageUrl"
        :src="qrImageUrl"
        :alt="$t('__hintScanToAddBot')"
        class="size-32 rounded-md"
      >
      <p class="text-sm text-toned">
        {{ $t('__descriptionFermionBotTest') }}
      </p>
      <UButton
        v-if="friendAddUrl"
        :to="friendAddUrl"
        target="_blank"
        rel="noopener"
        icon="i-simple-icons-line"
        size="sm"
      >
        {{ $t('__actionAddBotOnLine') }}
      </UButton>
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
