<script setup lang="ts">
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
      v-for="i in 3"
      :key="i"
      class="p-4 sm:p-6 rounded-md ring ring-inset ring-muted bg-muted/50 flex items-center gap-4"
    >
      <USkeleton class="size-9 rounded-full shrink-0" />
      <div class="flex-1 min-w-0 flex flex-col gap-0.5">
        <div class="h-6 flex items-center">
          <USkeleton
            class="h-3.5"
            :class="TITLE_WIDTHS[(i - 1) % TITLE_WIDTHS.length]"
          />
        </div>
        <div class="h-5 flex items-center">
          <USkeleton
            class="h-3 bg-muted/70"
            :class="SUBTITLE_WIDTHS[(i - 1) % SUBTITLE_WIDTHS.length]"
          />
        </div>
      </div>
      <div class="h-4 flex items-center shrink-0">
        <USkeleton class="h-2.5 w-20 bg-muted/70" />
      </div>
    </div>
  </div>
</template>
