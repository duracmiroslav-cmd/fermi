<script setup lang="ts">
const route = useRoute();
const props = defineProps<{
  to:    string;
  icon:  string;
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
    class="group flex items-center gap-3 p-2 rounded-lg font-mono text-sm font-medium transition-all"
    :class="isActive
      ? 'text-primary bg-primary/10'
      : 'text-toned hover:text-highlighted hover:bg-elevated'"
  >
    <UIcon
      :name="icon"
      class="size-4 shrink-0 transition-transform"
      :class="isActive ? 'scale-110' : 'group-hover:scale-110'"
    />
    <span>{{ label }}</span>
  </NuxtLink>
</template>
