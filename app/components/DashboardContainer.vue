<script setup lang="ts">
// `wide` opts a page into the studio width (two-column workspaces like the
// agent detail page); every other page stays at the default reading width.
const props = defineProps<{ wide?: boolean }>();
</script>

<template>
  <div
    class="px-6 sm:px-8 pt-6 sm:pt-8 pb-24 flex flex-col gap-6"
    :class="props.wide ? 'max-w-6xl' : 'max-w-3xl'"
  >
    <slot />
  </div>
</template>
