<script setup lang="ts">
const props = defineProps<{
  open:         boolean;
  title:        string;
  itemName:     string;
  confirmLabel: string;
  loading?:     boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  'confirm':     [];
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
      <UCard>
        <template #header>
          <h2 class="text-base font-semibold text-error">
            {{ title }}
          </h2>
        </template>

        <div class="flex flex-col gap-4">
          <div class="text-sm text-toned">
            <slot />
          </div>

          <UFormField>
            <template #label>
              <span>
                Type
                <span class="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{{ itemName }}</span>
                to confirm
              </span>
            </template>
            <UInput
              v-model.trim="confirmInput"
              autocomplete="off"
            />
          </UFormField>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
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
        </template>
      </UCard>
    </template>
  </UModal>
</template>
