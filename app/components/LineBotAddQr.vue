<script setup lang="ts">
// The LINE add-friend QR + link for a bot, derived from its handle
// (@basicId). Shared by the bot detail page and the bot-claim widget.
const props = defineProps<{ handle: string | null }>();

const friendAddUrl = computed(() =>
  props.handle ? `https://line.me/R/ti/p/${props.handle}` : null,
);
const qrImageUrl = computed(() =>
  props.handle ? `https://qr-official.line.me/sid/L/${props.handle.replace(/^@/, '')}.png` : null,
);
</script>

<template>
  <div
    v-if="qrImageUrl && friendAddUrl"
    class="flex flex-col items-center gap-3 text-center"
  >
    <img
      :src="qrImageUrl"
      :alt="$t('__hintScanToAddBot')"
      class="size-32 rounded-md"
    >
    <UButton
      :to="friendAddUrl"
      target="_blank"
      rel="noopener"
      icon="i-simple-icons-line"
      size="sm"
    >
      {{ $t('__actionAddBotOnLine') }}
    </UButton>
  </div>
  <p
    v-else
    class="text-sm text-muted"
  >
    {{ $t('__hintSyncForQr') }}
  </p>
</template>
