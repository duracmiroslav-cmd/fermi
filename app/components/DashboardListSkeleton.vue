<script setup lang="ts">
withDefaults(defineProps<{
  rows?: number;
}>(), {
  rows: 3,
});

// Deterministic widths so server + client render the same skeleton.
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
      class="p-4 rounded-md ring ring-inset ring-muted bg-elevated/50 flex items-center gap-4 animate-pulse"
    >
      <div class="size-9 rounded-full bg-muted shrink-0" />
      <div class="flex-1 min-w-0">
        <div class="h-6 flex items-center">
          <div
            class="h-3.5 rounded bg-muted"
            :class="TITLE_WIDTHS[(i - 1) % TITLE_WIDTHS.length]"
          />
        </div>
        <div class="h-5 flex items-center mt-0.5">
          <div
            class="h-3 rounded bg-muted/70"
            :class="SUBTITLE_WIDTHS[(i - 1) % SUBTITLE_WIDTHS.length]"
          />
        </div>
      </div>
      <div class="h-5 flex items-center shrink-0">
        <div class="h-3 w-20 rounded bg-muted/70" />
      </div>
    </div>
  </div>
</template>
