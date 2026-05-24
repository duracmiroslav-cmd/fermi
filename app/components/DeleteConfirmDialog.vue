<script setup lang="ts">
const props = defineProps<{
  open: boolean;
  title: string;
  itemName: string;
  confirmLabel: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  'confirm': [];
}>();

const confirmInput = ref('');
const matches = computed(() => confirmInput.value === props.itemName);

watch(() => props.open, (v) => {
  if (v) confirmInput.value = '';
});

const onClose = () => emit('update:open', false);
const onConfirm = () => {
  if (matches.value) emit('confirm');
};
</script>

<template>
  <UModal
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <div class="p-6 space-y-5">
        <div>
          <h2 class="font-mono text-xs uppercase tracking-wider text-error mb-2">
            {{ title }}
          </h2>
          <div class="text-sm text-toned">
            <slot />
          </div>
        </div>

        <div>
          <label class="block font-mono text-xs text-muted mb-2">
            type
            <span class="text-highlighted">{{ itemName }}</span>
            to confirm
          </label>
          <UInput
            v-model="confirmInput"
            autocomplete="off"
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <UButton
            color="neutral"
            variant="ghost"
            @click="onClose"
          >
            Cancel
          </UButton>
          <UButton
            color="error"
            :disabled="!matches"
            :loading="loading"
            @click="onConfirm"
          >
            {{ confirmLabel }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
