<script setup lang="ts">
withDefaults(defineProps<{
  rows?: number;
}>(), {
  rows: 3,
});

// Deterministic widths so server + client render the same skeleton
// (random would cause a hydration mismatch). Cycles through these
// three sizes for the title bar; subtitle is always narrower.
const TITLE_WIDTHS = ['w-40', 'w-32', 'w-48'];
const SUBTITLE_WIDTHS = ['w-24', 'w-28', 'w-20'];
</script>

<template>
  <div
    class="space-y-2 max-w-3xl"
    aria-busy="true"
    aria-live="polite"
  >
    <div
      v-for="i in rows"
      :key="i"
      class="flex items-center gap-4 p-4 rounded-md border border-default animate-pulse"
    >
      <div class="size-8 rounded-full bg-muted shrink-0" />
      <div class="flex-1 min-w-0 space-y-2">
        <div
          class="h-3 rounded bg-muted"
          :class="TITLE_WIDTHS[(i - 1) % TITLE_WIDTHS.length]"
        />
        <div
          class="h-2 rounded bg-muted/70"
          :class="SUBTITLE_WIDTHS[(i - 1) % SUBTITLE_WIDTHS.length]"
        />
      </div>
      <div class="h-2 w-12 rounded bg-muted/70 shrink-0" />
    </div>
  </div>
</template>
