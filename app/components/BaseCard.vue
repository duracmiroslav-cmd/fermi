<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';

defineProps<{
  to?: RouteLocationRaw;
}>();

defineOptions({ inheritAttrs: false });

const slots = useSlots();
const useUCard = computed(() => !!slots.header || !!slots.footer);

const FLAT_CLASS = 'p-4 rounded-md ring ring-inset ring-muted bg-elevated/50';
</script>

<template>
  <NuxtLink
    v-if="to"
    :to="to"
    class="block"
  >
    <UCard
      v-if="useUCard"
      v-bind="$attrs"
    >
      <template
        v-if="$slots.header"
        #header
      >
        <slot name="header" />
      </template>
      <slot />
      <template
        v-if="$slots.footer"
        #footer
      >
        <slot name="footer" />
      </template>
    </UCard>
    <div
      v-else
      v-bind="$attrs"
      :class="FLAT_CLASS"
    >
      <slot />
    </div>
  </NuxtLink>

  <UCard
    v-else-if="useUCard"
    v-bind="$attrs"
  >
    <template
      v-if="$slots.header"
      #header
    >
      <slot name="header" />
    </template>
    <slot />
    <template
      v-if="$slots.footer"
      #footer
    >
      <slot name="footer" />
    </template>
  </UCard>

  <div
    v-else
    v-bind="$attrs"
    :class="FLAT_CLASS"
  >
    <slot />
  </div>
</template>
