<script setup lang="ts">
const props = defineProps<{
  platform: string;
}>();

const PLATFORM_LABEL: Record<string, string> = { line: 'LINE' };
const PLATFORM_ICON: Record<string, string> = { line: 'i-simple-icons-line' };
// Brand colors for the logo; unmapped platforms inherit the text color.
const PLATFORM_COLOR: Record<string, string> = { line: '#06C755' };

const label = computed(() => PLATFORM_LABEL[props.platform] ?? props.platform);
const icon = computed(() => PLATFORM_ICON[props.platform] ?? 'i-lucide-message-circle');
const color = computed(() => PLATFORM_COLOR[props.platform]);
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <UIcon
      :name="icon"
      class="size-4"
      :style="{ color }"
    />
    {{ label }}
  </span>
</template>
