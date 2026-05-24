<script setup lang="ts">
import { createAgentInputSchema } from '~~/shared/schemas/agents';

interface AgentFormValue {
  name: string;
  systemPrompt: string;
  defaultModel: string;
}

const props = defineProps<{
  formId: string;
  initialValue?: Partial<AgentFormValue>;
}>();

const emit = defineEmits<{
  submit: [value: AgentFormValue];
}>();

const models = [
  { label: 'Gemma 4 31B (Google, free)', value: 'google/gemma-4-31b-it:free' },
  { label: 'Claude Sonnet 4.6 (Anthropic)', value: 'anthropic/claude-sonnet-4-6' },
];

const state = reactive<AgentFormValue>({
  name: props.initialValue?.name ?? '',
  systemPrompt: props.initialValue?.systemPrompt ?? '',
  defaultModel: props.initialValue?.defaultModel ?? models[0]!.value,
});

const promptCharCount = computed(() => state.systemPrompt.length);

const onSubmit = () => {
  emit('submit', { ...state });
};
</script>

<template>
  <UForm
    :id="formId"
    :schema="createAgentInputSchema"
    :state="state"
    class="flex flex-col gap-6"
    @submit="onSubmit"
  >
    <UFormField
      label="Name"
      name="name"
      required
    >
      <UInput
        v-model="state.name"
        placeholder="my agent"
      />
    </UFormField>

    <UFormField
      label="System prompt"
      name="systemPrompt"
    >
      <template #hint>
        <span class="font-mono text-xs text-dimmed">
          {{ promptCharCount }} / 8000
        </span>
      </template>
      <UTextarea
        v-model="state.systemPrompt"
        :rows="12"
        placeholder="You are a helpful assistant..."
        :ui="{ base: 'font-mono' }"
      />
    </UFormField>

    <UFormField
      label="Default model"
      name="defaultModel"
    >
      <USelect
        v-model="state.defaultModel"
        :items="models"
        :ui="{ base: 'font-mono' }"
      />
    </UFormField>
  </UForm>
</template>
