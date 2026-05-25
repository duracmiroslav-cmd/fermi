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
  { label: 'Llama 3.3 70B (Meta, free)', value: 'meta-llama/llama-3.3-70b-instruct:free' },
  { label: 'Qwen3 Next 80B (Alibaba, free)', value: 'qwen/qwen3-next-80b-a3b-instruct:free' },
  { label: 'DeepSeek V4 Flash (DeepSeek, free)', value: 'deepseek/deepseek-v4-flash:free' },
  { label: 'GPT-OSS 120B (OpenAI, free)', value: 'openai/gpt-oss-120b:free' },
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
      help="A label for you to recognize this agent. Users on LINE never see it."
    >
      <UInput
        v-model="state.name"
        placeholder="my agent"
      />
    </UFormField>

    <UFormField
      label="System prompt"
      name="systemPrompt"
      help="The persona instructions the agent follows. Sets its voice and behavior."
    >
      <template #hint>
        <span class="text-sm text-toned">
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
      help="The AI model that generates this agent's replies."
    >
      <USelect
        v-model="state.defaultModel"
        :items="models"
        :ui="{ base: 'font-mono' }"
      />
    </UFormField>
  </UForm>
</template>
