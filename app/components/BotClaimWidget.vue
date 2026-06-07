<script setup lang="ts">
const props = defineProps<{ botId: string }>();
// The chat continues once the sender is imprinted as master.
const emit = defineEmits<{ replied: [] }>();

// The bot's handle drives the add-on-LINE QR.
const { data: bot } = useApiFetch<{ handle: string | null }>(() => `/api/bots/${props.botId}`);

const code = ref<string | null>(null);
const bound = ref(false);
const { copy, copied } = useClipboard();

const celebrate = async () => {
  const { default: confetti } = await import('canvas-confetti');
  confetti({
    particleCount: 160,
    spread:        140,
    origin:        { y: 0.4 },
    colors:        ['#f48c6c', '#88bf68', '#ed9800', '#f03553'],
  });
};

// Poll until the worker imprints a master (the owner DM'd the code). Starts
// immediately so a re-mount onto an already-claimed bot resolves at once.
const { pause } = useIntervalFn(async () => {
  const status = await $fetch<{ bound: boolean }>(`/api/bots/${props.botId}/imprint`);
  if (!status.bound) return;
  bound.value = true;
  pause();
  celebrate();
  emit('replied');
}, 4000, { immediate: true });

// Arming when the widget appears is the owner opening the claim window.
onMounted(async () => {
  try {
    const armed = await $fetch<{ code: string }>(`/api/bots/${props.botId}/imprint`, { method: 'POST' });
    code.value = armed.code;
  } catch {
    // Already bound, or a transient error — the poll above still resolves the
    // bound case, so leave the code blank rather than blocking the widget.
  }
});
</script>

<template>
  <UCard class="w-full max-w-md">
    <div
      v-if="bound"
      class="flex items-center gap-2 text-sm"
    >
      <UIcon
        name="i-lucide-party-popper"
        class="size-5 text-primary"
      />
      {{ $t('__labelBotClaimed') }}
    </div>
    <div
      v-else
      class="flex flex-col items-center gap-3 text-center"
    >
      <p class="text-sm text-toned">
        {{ $t('__descriptionBotClaim') }}
      </p>
      <LineBotAddQr :handle="bot?.handle ?? null" />
      <UButton
        v-if="code"
        :label="code"
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        color="neutral"
        variant="soft"
        class="font-mono tracking-widest"
        @click="code && copy(code)"
      />
      <p class="flex items-center gap-1.5 text-xs text-toned">
        <UIcon
          name="i-lucide-loader-circle"
          class="size-3.5 animate-spin"
        />
        {{ $t('__hintWaitingClaim') }}
      </p>
    </div>
  </UCard>
</template>
