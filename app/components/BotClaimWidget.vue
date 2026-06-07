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

// Arms (or re-arms) a fresh imprint code. The code carries a short TTL on the
// server; the widget refreshes it before it lapses so what's on screen is
// always live — otherwise an owner who opens this and DMs the code minutes
// later sends a dead code that silently fails to bind.
let expiresAtMs = 0;
let rearming = false;
const arm = async () => {
  if (rearming) return;
  rearming = true;
  try {
    const armed = await $fetch<{ code: string; expiresAt: string }>(`/api/bots/${props.botId}/imprint`, { method: 'POST' });
    code.value = armed.code;
    expiresAtMs = new Date(armed.expiresAt).getTime();
  } catch {
    // Already bound, or a transient error — the poll below still resolves the
    // bound case, so leave the code as-is rather than blocking the widget.
  } finally {
    rearming = false;
  }
};

// Poll until the worker imprints a master (the owner DM'd the code), re-arming
// the code shortly before it expires. Starts immediately so a re-mount onto an
// already-claimed bot resolves at once.
const { pause } = useIntervalFn(async () => {
  if (expiresAtMs && Date.now() > expiresAtMs - 20_000) await arm();
  const status = await $fetch<{ bound: boolean }>(`/api/bots/${props.botId}/imprint`);
  if (!status.bound) return;
  bound.value = true;
  pause();
  celebrate();
  emit('replied');
}, 4000, { immediate: true });

// Arm the first code when the widget appears.
onMounted(arm);
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
