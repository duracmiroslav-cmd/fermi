<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui';

const props = defineProps<{
  items:    BreadcrumbItem[];
  loading?: boolean;
}>();

const { t } = useI18n();

// Skeleton any crumb whose label hasn't resolved yet, not just the leaf:
// intermediate async labels (e.g. the agent name above a static "Edit"
// crumb) would otherwise render as an empty gap between chevrons.
const fullItems = computed<BreadcrumbItem[]>(() => [
  { label: t('__labelHome'), to: '/dashboard' },
  ...props.items.map(item => ({
    ...item,
    slot: props.loading && !item.label ? 'loading' : undefined,
  })),
]);
</script>

<template>
  <UBreadcrumb :items="fullItems">
    <template #loading>
      <USkeleton class="inline-block h-4 w-24" />
    </template>
  </UBreadcrumb>
</template>
