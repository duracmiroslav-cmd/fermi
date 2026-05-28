<script setup lang="ts">
import { DEFAULT_TEXT_MODEL, DEFAULT_VISION_MODEL } from '~~/shared/constants/models';
import { createAgentInputSchema } from '~~/shared/schemas/agents';

interface AgentFormValue {
  name:               string;
  systemPrompt:       string;
  defaultTextModel:   string;
  defaultVisionModel: string;
}

interface ProviderModel {
  id:             string;
  name:           string;
  contextLength:  number;
  isFree:         boolean;
  promptCost:     number;
  completionCost: number;
  modality:       string;
  avatar:         { icon: string };
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
  // New agents seed both pickers with the worker fallbacks; edit preserves stored values.
  defaultTextModel: props.initialValue
    ? (props.initialValue.defaultTextModel ?? '')
    : DEFAULT_TEXT_MODEL,
  defaultVisionModel: props.initialValue
    ? (props.initialValue.defaultVisionModel ?? '')
    : DEFAULT_VISION_MODEL,
});

const isModelPickerOpening = ref(false);
const isVisionPickerOpening = ref(false);

// Same UUID-flash-avoidance trick as the agent picker: hide value while loading.
const displayModelId = computed<string | undefined>({
  get: () => (modelsPending.value ? undefined : state.defaultTextModel || undefined),
  set: (v) => { if (v) state.defaultTextModel = v; },
});

const displayVisionModelId = computed<string | undefined>({
  get: () => (modelsPending.value ? undefined : state.defaultVisionModel || undefined),
  set: (v) => { if (v) state.defaultVisionModel = v; },
});

const modelItems = computed(() =>
  (models.value ?? []).map(m => ({
    label:       m.name,
    value:       m.id,
    description: formatContext(m.contextLength),
    isFree:      m.isFree,
    avatar:      m.avatar,
  })),
);

// Vision-capable models only: the worker swaps to this whenever a
// conversation includes an image, so a text-only pick would break it.
const visionModelItems = computed(() =>
  (models.value ?? [])
    .filter(m => m.modality.includes('image'))
    .map(m => ({
      label:       m.name,
      value:       m.id,
      description: formatContext(m.contextLength),
      isFree:      m.isFree,
      avatar:      m.avatar,
    })),
);

const selectedModel = computed(() =>
  (models.value ?? []).find(m => m.id === state.defaultTextModel) ?? null,
);

const selectedVisionModel = computed(() =>
  (models.value ?? []).find(m => m.id === state.defaultVisionModel) ?? null,
);

// Empty pickers (the Default agent ships with no model) inherit the
// worker fallback. Surfacing the fallback model's name + icon in the
// placeholder tells the user what a run will use, instead of a blank
// "Select a model" that reads as unset — while keeping the field truly
// empty so saving preserves the null.
const defaultTextModelInfo = computed(() =>
  (models.value ?? []).find(m => m.id === DEFAULT_TEXT_MODEL)
  ?? { id: DEFAULT_TEXT_MODEL, name: DEFAULT_TEXT_MODEL, avatar: { icon: 'i-lucide-sparkles' } },
);

const defaultVisionModelInfo = computed(() =>
  (models.value ?? []).find(m => m.id === DEFAULT_VISION_MODEL)
  ?? { id: DEFAULT_VISION_MODEL, name: DEFAULT_VISION_MODEL, avatar: { icon: 'i-lucide-sparkles' } },
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
      label="Default text model"
      name="defaultTextModel"
      help="The AI model that generates this agent's replies."
    >
      <USelectMenu
        v-model="displayModelId"
        :items="modelItems"
        value-key="value"
        :placeholder="`${defaultTextModelInfo.name} (default)`"
        :loading="modelsPending || isModelPickerOpening"
        :ui="{ itemTrailingIcon: 'hidden' }"
        @pointerdown="isModelPickerOpening = true"
        @update:open="isModelPickerOpening = false"
      >
        <template #item-leading="{ item }">
          <UIcon
            :name="item.avatar.icon"
            class="size-5 text-toned"
          />
        </template>
        <template #leading>
          <UIcon
            v-if="isModelPickerOpening"
            name="i-lucide-loader-circle"
            class="size-5 animate-spin text-toned"
          />
          <UIcon
            v-else-if="selectedModel"
            :name="selectedModel.avatar.icon"
            class="size-5 text-toned"
          />
          <UIcon
            v-else
            :name="defaultTextModelInfo.avatar.icon"
            class="size-5 text-toned"
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
          <!-- size-7 box aligns the check with the trailing button -->
          <span class="flex items-center justify-center size-7 shrink-0">
            <UIcon
              v-if="state.defaultTextModel === item.value"
              name="i-lucide-check"
              class="size-4"
            />
          </span>
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
        </template>
      </USelectMenu>
    </UFormField>

    <UFormField
      label="Vision model"
      name="defaultVisionModel"
      help="Used to read images sent into the conversation, whatever the text model is set to. Only vision-capable models are listed."
    >
      <USelectMenu
        v-model="displayVisionModelId"
        :items="visionModelItems"
        value-key="value"
        :placeholder="`${defaultVisionModelInfo.name} (default)`"
        :loading="modelsPending || isVisionPickerOpening"
        :ui="{ itemTrailingIcon: 'hidden' }"
        @pointerdown="isVisionPickerOpening = true"
        @update:open="isVisionPickerOpening = false"
      >
        <template #item-leading="{ item }">
          <UIcon
            :name="item.avatar.icon"
            class="size-5 text-toned"
          />
        </template>
        <template #leading>
          <UIcon
            v-if="isVisionPickerOpening"
            name="i-lucide-loader-circle"
            class="size-5 animate-spin text-toned"
          />
          <UIcon
            v-else-if="selectedVisionModel"
            :name="selectedVisionModel.avatar.icon"
            class="size-5 text-toned"
          />
          <UIcon
            v-else
            :name="defaultVisionModelInfo.avatar.icon"
            class="size-5 text-toned"
          />
        </template>
        <template #empty="{ searchTerm }">
          <span v-if="modelsPending">Loading models…</span>
          <span v-else-if="searchTerm">No models match "{{ searchTerm }}"</span>
          <span v-else>No vision models available</span>
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
          <!-- size-7 box aligns the check with the trailing button -->
          <span class="flex items-center justify-center size-7 shrink-0">
            <UIcon
              v-if="state.defaultVisionModel === item.value"
              name="i-lucide-check"
              class="size-4"
            />
          </span>
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
        </template>
      </USelectMenu>
    </UFormField>
  </UForm>
</template>
