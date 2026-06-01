<script setup lang="ts">
import type { AvatarSize } from './GeneratedAvatar.vue';

withDefaults(defineProps<{
  seed:  string;
  size?: AvatarSize;
}>(), {
  size: 'md',
});
</script>

<template>
  <!-- `beam` sets voices apart from the agent picker's `marble` blobs;
       both share the brand palette via GeneratedAvatar, so the two
       pickers read as one family. -->
  <GeneratedAvatar
    :seed="seed"
    variant="beam"
    :size="size"
  />
</template>
