<script setup lang="ts">
import type { AvatarSize } from './GeneratedAvatar.vue';

// `seed` is the agent's stable id — every agent has one, so the generated
// avatar survives renames. `name` is the uploaded image's alt text only;
// required so every caller declares it, with null the explicit
// "no caption" — a missing alt can't slip through.
withDefaults(defineProps<{
  seed:  string;
  name:  string | null;
  src?:  string | null;
  size?: AvatarSize;
}>(), {
  src:  null,
  size: 'md',
});
</script>

<template>
  <UAvatar
    v-if="src"
    :src="src"
    :alt="name ?? undefined"
    :size="size"
    class="shrink-0"
  />
  <GeneratedAvatar
    v-else
    :seed="seed"
    variant="marble"
    :size="size"
  />
</template>
