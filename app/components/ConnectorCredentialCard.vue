<script setup lang="ts">
// Masked-key + Connect/Disconnect card for connector detail pages.
// 'oauth' mode skips the input and routes Connect to the parent's
// redirect handler; 'key' mode collects the value and emits it.

const props = defineProps<{
  label:          string;
  status:         'connected' | 'available';
  mode:           'oauth' | 'key';
  maskedKey?:     string | null;
  placeholder?:   string;
  connecting?:    boolean;
  disconnecting?: boolean;
}>();

const emit = defineEmits<{
  connect:    [value: string];
  disconnect: [];
}>();

const draft = ref('');

const inputValue = computed(() => {
  if (props.status === 'connected') return props.maskedKey ?? '';
  return props.mode === 'key' ? draft.value : '';
});

const inputType = computed(() => {
  if (props.status === 'connected' || props.mode === 'oauth') return 'text';
  return 'password';
});

const isReadonly = computed(() =>
  props.status === 'connected' || props.mode === 'oauth',
);

const onSubmit = () => {
  if (props.status === 'connected') return;
  if (props.mode === 'key' && !draft.value.trim()) return;
  emit('connect', draft.value);
};

// Status flipping to connected after a successful key submit means the
// input becomes the masked readonly view; clear the draft so a later
// disconnect doesn't repopulate stale text.
watch(() => props.status, (s) => {
  if (s === 'connected') draft.value = '';
});
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UFormField :label="label">
      <div class="flex items-end gap-4">
        <UInput
          :model-value="inputValue"
          :readonly="isReadonly"
          :type="inputType"
          icon="i-lucide-key-round"
          :placeholder="placeholder"
          autocomplete="off"
          class="flex-1 min-w-0"
          @update:model-value="(v) => (draft = String(v))"
        />
        <UButton
          v-if="status === 'connected'"
          color="error"
          variant="outline"
          :loading="disconnecting"
          @click="emit('disconnect')"
        >
          {{ $t('__actionDisconnect') }}
        </UButton>
        <UButton
          v-else
          type="submit"
          :trailing-icon="mode === 'oauth' ? 'i-lucide-arrow-up-right' : 'i-lucide-arrow-right'"
          :loading="connecting"
          :disabled="mode === 'key' && !draft.trim()"
        >
          {{ $t('__actionConnect') }}
        </UButton>
      </div>
      <template
        v-if="status === 'available' && $slots.help"
        #help
      >
        <slot name="help" />
      </template>
    </UFormField>
  </form>
</template>
