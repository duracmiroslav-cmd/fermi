<script setup lang="ts">
import { createAgentInputSchema } from '~~/shared/schemas/agents';

interface AgentFormValue {
  name:             string;
  systemPrompt:     string;
  defaultTextModel: string;
}

interface ProviderModel {
  id:             string;
  name:           string;
  contextLength:  number;
  isFree:         boolean;
  promptCost:     number;
  completionCost: number;
  modality:       string;
  avatar:         { icon?: string; text?: string };
}

const props = defineProps<{
  formId:        string;
  initialValue?: Partial<AgentFormValue>;
}>();

const emit = defineEmits<{
  submit: [value: AgentFormValue];
}>();

const { data: models, pending: modelsPending } = useApiFetch<ProviderModel[]>('/api/providers/openrouter/models');

const formatContext = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M context` : `${Math.round(n / 1000)}k context`;

const state = reactive<AgentFormValue>({
  name:             props.initialValue?.name ?? '',
  systemPrompt:     props.initialValue?.systemPrompt ?? '',
  defaultTextModel: props.initialValue?.defaultTextModel ?? '',
});

const isModelPickerOpening = ref(false);

// Same UUID-flash-avoidance trick as the agent picker: hide value while loading.
const displayModelId = computed<string | undefined>({
  get: () => (modelsPending.value ? undefined : state.defaultTextModel || undefined),
  set: (v) => { if (v) state.defaultTextModel = v; },
});

const modelItems = computed(() =>
  (models.value ?? []).map(m => ({
    label:       m.name,
    value:       m.id,
    description: formatContext(m.contextLength),
    isFree:      m.isFree,
    avatar:      { ...m.avatar, color: 'primary' as const },
  })),
);

const selectedModel = computed(() =>
  (models.value ?? []).find(m => m.id === state.defaultTextModel) ?? null,
);

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
        v-model.trim="state.name"
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
        v-model.trim="state.systemPrompt"
        :rows="12"
        placeholder="You are a helpful assistant..."
      />
    </UFormField>

    <UFormField
      label="Default model"
      name="defaultTextModel"
      help="The AI model that generates this agent's replies."
    >
      <USelectMenu
        v-model="displayModelId"
        :items="modelItems"
        value-key="value"
        placeholder="Select a model"
        :loading="modelsPending || isModelPickerOpening"
        :ui="{ base: 'ps-10!', itemLeadingAvatarSize: 'lg' }"
        @pointerdown="isModelPickerOpening = true"
        @update:open="isModelPickerOpening = false"
      >
        <template #leading>
          <UIcon
            v-if="isModelPickerOpening"
            name="i-lucide-loader-circle"
            class="size-5 animate-spin text-toned"
          />
          <UAvatar
            v-else-if="selectedModel"
            v-bind="selectedModel.avatar"
            size="xs"
            color="primary"
          />
        </template>
        <template #empty="{ searchTerm }">
          <span v-if="modelsPending">Loading models…</span>
          <span v-else-if="searchTerm">No models match "{{ searchTerm }}"</span>
          <span v-else>No models available</span>
        </template>
        <template #item-label="{ item }">
          <span class="inline-flex items-center gap-1.5 truncate">
            {{ item.label }}
            <UBadge
              v-if="item.isFree"
              color="neutral"
              variant="subtle"
              size="xs"
            >
              free
            </UBadge>
          </span>
        </template>
        <template #item-trailing="{ item }">
          <UTooltip text="View on OpenRouter">
            <UButton
              :to="`https://openrouter.ai/${item.value}`"
              target="_blank"
              rel="noopener"
              icon="i-lucide-external-link"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="View on OpenRouter"
              class="hover:bg-accented! group-data-[state=checked]:hover:bg-primary/20!"
              @click.stop
              @pointerdown.stop
            />
          </UTooltip>
          <div
            v-if="state.defaultTextModel !== item.value"
            class="size-5 shrink-0"
            aria-hidden="true"
          />
        </template>
      </USelectMenu>
    </UFormField>
  </UForm>
</template>
