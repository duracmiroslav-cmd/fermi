<script setup lang="ts">
withDefaults(defineProps<{
  fields?: number;
}>(), {
  fields: 3,
});
</script>

<template>
  <DashboardContainer
    aria-busy="true"
    aria-live="polite"
  >
    <div class="flex items-center gap-4">
      <USkeleton class="size-12 rounded-full bg-elevated shrink-0" />
      <USkeleton class="h-7 w-48 bg-elevated" />
    </div>

    <div
      v-for="i in fields"
      :key="i"
      class="space-y-2"
    >
      <USkeleton class="h-4 w-24 bg-elevated" />
      <USkeleton class="h-9 w-full bg-elevated" />
    </div>

    <div class="space-y-2">
      <USkeleton class="h-4 w-16 bg-elevated" />
      <USkeleton class="h-24 w-full bg-elevated" />
    </div>
  </DashboardContainer>
</template>
