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
    class="group relative flex items-center gap-3 px-3 py-2 rounded-lg font-mono text-sm font-medium transition-all"
    :class="isActive
      ? 'text-primary bg-primary/10'
      : 'text-toned hover:text-highlighted hover:bg-elevated'"
  >
    <span
      class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-r-full bg-primary transition-all"
      :class="isActive ? 'h-5 opacity-100' : 'h-0 opacity-0'"
      aria-hidden="true"
    />
    <UIcon
      :name="icon"
      class="size-4 shrink-0 transition-transform"
      :class="isActive ? 'scale-110' : 'group-hover:scale-110'"
    />
    <span>{{ label }}</span>
  </NuxtLink>
</template>
