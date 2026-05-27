<script setup lang="ts">
defineProps<{
  label:        string;
  description?: string;
}>();

const model = defineModel<boolean>();
</script>

<template>
  <div class="flex items-center justify-between gap-6">
    <div class="min-w-0">
      <p class="text-sm font-medium">
        {{ label }}
      </p>
      <p
        v-if="description"
        class="text-sm text-toned mt-0.5"
      >
        {{ description }}
      </p>
    </div>
    <USwitch
      v-model="model"
      :aria-label="label"
      class="shrink-0"
    />
  </div>
</template>
