<script setup lang="ts">
withDefaults(defineProps<{
  fields?: number;
}>(), {
  fields: 3,
});
</script>

<template>
  <div
    class="p-6 sm:p-8 pb-12 max-w-3xl flex flex-col gap-6"
    aria-busy="true"
    aria-live="polite"
  >
    <div class="flex items-center gap-4 animate-pulse">
      <div class="size-12 rounded-full bg-elevated shrink-0" />
      <div class="h-7 w-48 rounded bg-elevated" />
    </div>

    <div
      v-for="i in fields"
      :key="i"
      class="space-y-2 animate-pulse"
    >
      <div class="h-4 w-24 rounded bg-elevated" />
      <div class="h-9 w-full rounded bg-elevated" />
    </div>

    <div class="space-y-2 animate-pulse">
      <div class="h-4 w-16 rounded bg-elevated" />
      <div class="h-24 w-full rounded bg-elevated" />
    </div>
  </div>
</template>
