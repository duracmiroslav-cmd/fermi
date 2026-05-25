<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';

defineProps<{
  to?: RouteLocationRaw;
}>();

const CARD_CLASS = 'p-4 rounded-md ring ring-inset ring-muted bg-elevated/50';
</script>

<template>
  <NuxtLink
    v-if="to"
    :to="to"
    :class="CARD_CLASS"
  >
    <slot />
  </NuxtLink>
  <div
    v-else
    :class="CARD_CLASS"
  >
    <slot />
  </div>
</template>
