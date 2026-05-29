<script setup lang="ts">
import type { VoiceReplyMode } from '~~/shared/agents';
import { DEFAULT_TEXT_MODEL, DEFAULT_VISION_MODEL } from '~~/shared/constants/models';
import { createAgentInputSchema } from '~~/shared/schemas/agents';
import {
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  TTS_MODELS,
  TTS_VOICES,
  type TtsModel,
  type TtsVoice,
  supportsTtsInstructions,
} from '~~/shared/tts';

// Narrow unions for the TTS columns let USelect's v-model typing
// stay strict end-to-end. `null` is the "unset, use worker fallback"
// sentinel — string '' would collide with USelect's empty-state
// detection. The text + vision model fields stay loose `string`
// because their catalog is OpenRouter (200+ entries, schema-checked
// only by length on the server, not enum membership).
interface AgentFormValue {
  name:               string;
  systemPrompt:       string;
  defaultTextModel:   string;
  defaultVisionModel: string;
  defaultTtsModel:    TtsModel | null;
  defaultTtsVoice:    TtsVoice | null;
  ttsInstructions:    string;
  voiceReplyMode:     VoiceReplyMode;
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

const notify = useNotify();

const { data: models, pending: modelsPending, refresh: refreshModels } = useApiFetch<ProviderModel[]>('/api/providers/openrouter/models');

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
  // TTS fields stay null on new agents so the worker fallback wins;
  // the placeholder copy surfaces what that fallback resolves to.
  defaultTtsModel: props.initialValue?.defaultTtsModel ?? null,
  defaultTtsVoice: props.initialValue?.defaultTtsVoice ?? null,
  ttsInstructions: props.initialValue?.ttsInstructions ?? '',
  voiceReplyMode:  props.initialValue?.voiceReplyMode ?? 'off',
});

const isTextModelPickerOpening = ref(false);
const isVisionModelPickerOpening = ref(false);
const isRefreshing = ref(false);
const isPreviewing = ref(false);
const previewAudioUrl = ref<string | null>(null);
const previewAudioRef = ref<HTMLAudioElement | null>(null);

// Same UUID-flash-avoidance trick as the agent picker: hide value while loading.
const displayTextModelId = computed<string | undefined>({
  get: () => (modelsPending.value ? undefined : state.defaultTextModel || undefined),
  set: (v) => { if (v) state.defaultTextModel = v; },
});

const displayVisionModelId = computed<string | undefined>({
  get: () => (modelsPending.value ? undefined : state.defaultVisionModel || undefined),
  set: (v) => { if (v) state.defaultVisionModel = v; },
});

const allModelItems = computed(() =>
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

const selectedTextModel = computed(() =>
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

// "(default)" suffix flags the recommended baseline so users browsing
// the dropdown see which pick they'd land on by leaving it blank.
const ttsModelItems = computed(() =>
  TTS_MODELS.map(m => ({
    label: m === DEFAULT_TTS_MODEL ? `${m} (default)` : m,
    value: m,
  })),
);

const ttsVoiceItems = computed(() =>
  TTS_VOICES.map(v => ({
    label: v === DEFAULT_TTS_VOICE ? `${v} (default)` : v,
    value: v,
  })),
);

const effectiveTtsModel = computed<TtsModel>(
  () => state.defaultTtsModel ?? DEFAULT_TTS_MODEL,
);

// USelect's v-model uses `undefined` for "no selection," matching
// the existing text / vision pickers' display computeds. Translate
// null ↔ undefined at the boundary so `state` keeps the null
// sentinel that matches the API + schema.
const displayTtsModel = computed<TtsModel | undefined>({
  get: () => state.defaultTtsModel ?? undefined,
  set: (v) => { state.defaultTtsModel = v ?? null; },
});

const displayTtsVoice = computed<TtsVoice | undefined>({
  get: () => state.defaultTtsVoice ?? undefined,
  set: (v) => { state.defaultTtsVoice = v ?? null; },
});

// Instructions only flow through to OpenAI for gpt-4o-mini-tts;
// older models silently drop them. Disabling the field signals that
// the value won't be honored without us throwing it away on submit.
const isInstructionsSupported = computed(() =>
  supportsTtsInstructions(effectiveTtsModel.value),
);

// Models come from OpenRouter; refresh re-pulls the catalog (e.g. after a
// failed initial load) without closing the picker.
const onRefresh = async () => {
  isRefreshing.value = true;
  try {
    await refreshModels();
  } finally {
    isRefreshing.value = false;
  }
};

const onPreview = async () => {
  if (isPreviewing.value) return;
  isPreviewing.value = true;
  // Revoke prior blob so accumulated previews don't leak memory
  // across an editing session.
  if (previewAudioUrl.value) {
    URL.revokeObjectURL(previewAudioUrl.value);
    previewAudioUrl.value = null;
  }
  try {
    const blob = await $fetch<Blob>('/api/agents/preview-tts', {
      method: 'POST',
      body:   {
        model:        effectiveTtsModel.value,
        voice:        state.defaultTtsVoice || DEFAULT_TTS_VOICE,
        instructions: state.ttsInstructions || null,
      },
      responseType: 'blob',
    });
    previewAudioUrl.value = URL.createObjectURL(blob);
    // Player auto-plays via the `autoplay` attribute on a fresh
    // mount; the :key bound to the blob URL forces remount per
    // preview so each click triggers playback even when the
    // element was already on screen.
  } catch (e) {
    notify.error('Preview failed', e);
  } finally {
    isPreviewing.value = false;
  }
};

const onSubmit = () => {
  emit('submit', { ...state });
};

onUnmounted(() => {
  if (previewAudioUrl.value) URL.revokeObjectURL(previewAudioUrl.value);
});
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
      label="Text model"
      name="defaultTextModel"
      help="The AI model that generates this agent's replies."
    >
      <USelectMenu
        v-model="displayTextModelId"
        :items="allModelItems"
        value-key="value"
        :placeholder="`${defaultTextModelInfo.name} (default)`"
        :loading="modelsPending || isTextModelPickerOpening"
        :ui="{ itemTrailingIcon: 'hidden' }"
        @pointerdown="isTextModelPickerOpening = true"
        @update:open="isTextModelPickerOpening = false"
      >
        <template #content-top>
          <div
            class="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-default"
            @pointerdown.stop
          >
            <span class="text-xs">
              {{ allModelItems.length }} text model{{ allModelItems.length === 1 ? '' : 's' }}
            </span>
            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              size="xs"
              label="Refresh"
              :loading="isRefreshing"
              @click.stop="onRefresh"
              @pointerdown.stop
            />
          </div>
        </template>
        <template #item-leading="{ item }">
          <UIcon
            :name="item.avatar.icon"
            class="size-5 text-toned"
          />
        </template>
        <template #leading>
          <UIcon
            v-if="isTextModelPickerOpening"
            name="i-lucide-loader-circle"
            class="size-5 animate-spin text-toned"
          />
          <UIcon
            v-else-if="selectedTextModel"
            :name="selectedTextModel.avatar.icon"
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
        :loading="modelsPending || isVisionModelPickerOpening"
        :ui="{ itemTrailingIcon: 'hidden' }"
        @pointerdown="isVisionModelPickerOpening = true"
        @update:open="isVisionModelPickerOpening = false"
      >
        <template #content-top>
          <div
            class="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-default"
            @pointerdown.stop
          >
            <span class="text-xs">
              {{ visionModelItems.length }} vision model{{ visionModelItems.length === 1 ? '' : 's' }}
            </span>
            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              size="xs"
              label="Refresh"
              :loading="isRefreshing"
              @click.stop="onRefresh"
              @pointerdown.stop
            />
          </div>
        </template>
        <template #item-leading="{ item }">
          <UIcon
            :name="item.avatar.icon"
            class="size-5 text-toned"
          />
        </template>
        <template #leading>
          <UIcon
            v-if="isVisionModelPickerOpening"
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

    <UFormField
      label="Voice reply"
      name="voiceReplyMode"
      help="Whether the agent speaks its replies. Audio replies use the owner's OpenAI key for TTS and cost more than text."
    >
      <URadioGroup
        v-model="state.voiceReplyMode"
        :items="[
          { label: 'Off', value: 'off', description: 'Never speak. Always reply with text.' },
          { label: 'Auto', value: 'auto', description: 'Mirror the user — speak only when the user sent voice.' },
          { label: 'Always', value: 'always', description: 'Always speak, regardless of how the user wrote.' },
        ]"
      />
    </UFormField>

    <UFormField
      label="Voice model"
      name="defaultTtsModel"
      help="The OpenAI TTS engine. gpt-4o-mini-tts is cheaper, higher quality, and the only one that honors voice instructions."
    >
      <USelect
        v-model="displayTtsModel"
        :items="ttsModelItems"
        value-key="value"
        :placeholder="`${DEFAULT_TTS_MODEL} (default)`"
      />
    </UFormField>

    <UFormField
      label="Voice"
      name="defaultTtsVoice"
      help="The character the agent speaks in. Hit play to hear a short sample."
    >
      <div class="flex items-center gap-2">
        <USelect
          v-model="displayTtsVoice"
          :items="ttsVoiceItems"
          value-key="value"
          :placeholder="`${DEFAULT_TTS_VOICE} (default)`"
          class="flex-1"
        />
        <UButton
          icon="i-lucide-play"
          color="neutral"
          variant="outline"
          :loading="isPreviewing"
          aria-label="Preview voice"
          @click="onPreview"
        />
      </div>
      <audio
        v-if="previewAudioUrl"
        :key="previewAudioUrl"
        ref="previewAudioRef"
        :src="previewAudioUrl"
        controls
        autoplay
        class="mt-2 w-full"
      />
    </UFormField>

    <UFormField
      label="Voice instructions"
      name="ttsInstructions"
      :help="isInstructionsSupported
        ? `Optional tone / pace / accent direction (e.g. 'speak calmly and warmly').`
        : 'Only honored when voice model is gpt-4o-mini-tts.'"
    >
      <UTextarea
        v-model.trim="state.ttsInstructions"
        :rows="3"
        :disabled="!isInstructionsSupported"
        placeholder="speak calmly and warmly"
      />
    </UFormField>
  </UForm>
</template>
