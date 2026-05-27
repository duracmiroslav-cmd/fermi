<script setup lang="ts">
import Avatar from 'vue-boring-avatars';

type AvatarSize = '3xs' | '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

const props = withDefaults(defineProps<{
  name: string | null;
  seed?: string | null;
  src?: string | null;
  size?: AvatarSize;
}>(), {
  seed: null,
  src: null,
  size: 'md',
});

const SIZE_PX: Record<AvatarSize, number> = {
  '3xs': 16,
  '2xs': 20,
  'xs': 24,
  'sm': 28,
  'md': 32,
  'lg': 36,
  'xl': 40,
  '2xl': 44,
  '3xl': 48,
};

// Warm-led with cool accents: three apricot-leaning warm tones plus a teal
// and indigo. The warm majority keeps it on-brand; the two cool hues give
// the id-seeded hash enough spread to tell agents apart.
const PALETTE = ['#e8728c', '#f0925a', '#f3c06b', '#5bb3b0', '#7c8fd6'];

// Seed by the stable id so the avatar survives renames; fall back to the
// name, then a constant so an empty agent still renders something.
const seedValue = computed(() => props.seed || props.name || '?');
</script>

<template>
  <UAvatar
    v-if="src"
    :src="src"
    :alt="name ?? undefined"
    :size="size"
    class="shrink-0"
  />
  <Avatar
    v-else
    :size="SIZE_PX[size]"
    :name="seedValue"
    variant="marble"
    :colors="PALETTE"
    class="shrink-0"
  />
</template>
