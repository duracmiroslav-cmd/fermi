<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui';

const props = defineProps<{
  items: BreadcrumbItem[];
  loading?: boolean;
}>();

const fullItems = computed<BreadcrumbItem[]>(() => {
  const lastIdx = props.items.length - 1;
  return [
    { label: 'Home', to: '/dashboard' },
    ...props.items.map((item, i) => ({
      ...item,
      slot: props.loading && i === lastIdx ? 'loading' : undefined,
    })),
  ];
});
</script>

<template>
  <UBreadcrumb :items="fullItems">
    <template #loading>
      <span class="inline-block h-4 w-24 bg-elevated rounded animate-pulse" />
    </template>
  </UBreadcrumb>
</template>
