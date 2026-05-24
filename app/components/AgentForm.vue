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
    class="space-y-8"
    @submit="onSubmit"
  >
    <section>
      <h2 class="font-mono text-xs uppercase tracking-wider text-dimmed mb-4">
        identity
      </h2>
      <UFormField
        label="Name"
        name="name"
        required
      >
        <UInput
          v-model="state.name"
          placeholder="my agent"
          class="w-full"
        />
      </UFormField>
    </section>

    <section>
      <h2 class="font-mono text-xs uppercase tracking-wider text-dimmed mb-4">
        behavior
      </h2>
      <div class="space-y-4">
        <UFormField name="systemPrompt">
          <template #label>
            <span class="flex items-center justify-between gap-2 w-full">
              <span>System prompt</span>
              <span class="font-mono text-xs text-dimmed">
                {{ promptCharCount }} / 8000
              </span>
            </span>
          </template>
          <UTextarea
            v-model="state.systemPrompt"
            :rows="12"
            placeholder="You are a helpful assistant..."
            class="w-full"
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
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </UFormField>
      </div>
    </section>
  </UForm>
</template>
