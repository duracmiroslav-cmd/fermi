<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui';

const props = defineProps<{
  items:    BreadcrumbItem[];
  loading?: boolean;
}>();

const { t } = useI18n();

const fullItems = computed<BreadcrumbItem[]>(() => {
  const lastIdx = props.items.length - 1;
  return [
    { label: t('__labelHome'), to: '/dashboard' },
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
      <USkeleton class="inline-block h-4 w-24" />
    </template>
  </UBreadcrumb>
</template>
