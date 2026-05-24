<script setup lang="ts">
const route = useRoute();
const props = defineProps<{
  to: string;
  icon: string;
  label: string;
}>();

const isActive = computed(() => {
  if (route.path === props.to) return true;
  return route.path.startsWith(`${props.to}/`);
});
</script>

<template>
  <NuxtLink
    :to="to"
    class="group flex items-center gap-3 px-3 py-2 rounded-md font-mono text-sm transition-colors"
    :class="isActive
      ? 'text-highlighted bg-muted/40'
      : 'text-muted hover:text-default hover:bg-muted/20'"
  >
    <span
      class="size-1 rounded-full transition-colors shrink-0"
      :class="isActive ? 'bg-primary' : 'bg-transparent group-hover:bg-muted'"
      aria-hidden="true"
    />
    <UIcon
      :name="icon"
      class="size-4 shrink-0"
    />
    <span>{{ label }}</span>
  </NuxtLink>
</template>
