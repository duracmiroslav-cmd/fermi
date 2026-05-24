<script setup lang="ts">
const props = defineProps<{
  open: boolean;
  botName: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  'confirm': [];
}>();

const confirmInput = ref('');
const matches = computed(() => confirmInput.value === props.botName);

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
            Delete bot
          </h2>
          <p class="text-sm text-toned">
            This permanently deletes
            <span class="font-mono text-highlighted">{{ botName }}</span>
            and its encrypted credentials. The agent bound to it (if any) is unlinked but kept.
          </p>
        </div>

        <div>
          <label class="block font-mono text-xs text-muted mb-2">
            type
            <span class="text-highlighted">{{ botName }}</span>
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
            Delete bot
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
