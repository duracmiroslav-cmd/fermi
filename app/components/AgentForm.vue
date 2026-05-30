<script setup lang="ts">
import type { VoiceReplyMode } from '~~/shared/agents';
import { DEFAULT_TEXT_MODEL, DEFAULT_VISION_MODEL } from '~~/shared/constants/models';
import { createAgentInputSchema } from '~~/shared/schemas/agents';
import {
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_MODEL_NAME,
  DEFAULT_TTS_VOICE,
  DEFAULT_TTS_VOICE_NAME,
  TTS_MODELS,
  TTS_VOICES,
  type TtsModel,
  type TtsVoice,
  VOICES_BY_MODEL,
  supportsTtsInstructions,
  supportsTtsVoice,
} from '~~/shared/tts';

// `null` is the canonical "unset, use worker fallback" sentinel for
// every picker field. Form layer (USelect / USelectMenu) maps null ↔
// undefined at the display computeds; API boundary passes null
// through to the PATCH body, which the DB stores as NULL.
interface AgentFormValue {
  name:               string;
  systemPrompt:       string;
  defaultTextModel:   string | null;
  defaultVisionModel: string | null;
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
    ? (props.initialValue.defaultTextModel ?? null)
    : DEFAULT_TEXT_MODEL,
  defaultVisionModel: props.initialValue
    ? (props.initialValue.defaultVisionModel ?? null)
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
// One in-flight Audio element so the next preview click can stop the
// prior one mid-playback. Held in a ref purely for cleanup; the player
// is invisible by design (no `<audio controls>` in the template) — the
// button is the entire UI.
const previewAudio = ref<HTMLAudioElement | null>(null);

// Hide value while loading to avoid a UUID flash before names arrive.
const displayTextModelId = computed<string | undefined>({
  get: () => (modelsPending.value ? undefined : state.defaultTextModel ?? undefined),
  set: (v) => { state.defaultTextModel = v ?? null; },
});

const displayVisionModelId = computed<string | undefined>({
  get: () => (modelsPending.value ? undefined : state.defaultVisionModel ?? undefined),
  set: (v) => { state.defaultVisionModel = v ?? null; },
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

// Stale = an explicit pick that's missing from the loaded catalog.
// Catches the "model retired" case: the worker would still 4xx at
// runtime, but surfacing it here lets the owner reset without waiting
// to discover it through a broken reply. Text / vision check against
// the dynamic OpenRouter list once it loads; TTS checks against the
// static fermi catalog (no async gating needed).
const isTextModelStale = computed(() =>
  !modelsPending.value
  && !!models.value
  && !!state.defaultTextModel
  && !selectedTextModel.value,
);

const isVisionModelStale = computed(() =>
  !modelsPending.value
  && !!models.value
  && !!state.defaultVisionModel
  && !selectedVisionModel.value,
);

const isTtsModelStale = computed(() =>
  !!state.defaultTtsModel
  && !TTS_MODELS.some(m => m.value === state.defaultTtsModel),
);

// Two ways a voice goes stale: the catalog dropped it entirely
// (fermi removed an OpenAI voice that retired), or the catalog still
// has it but the currently-selected TTS model doesn't accept it
// (e.g. cedar with tts-1). Distinguishing the reason lets the warning
// copy say something true: "no longer available" vs "doesn't work
// with X". Reset CTA stays the same.
const ttsVoiceStaleReason = computed<'catalog' | 'incompat' | null>(() => {
  const voice = state.defaultTtsVoice;
  if (!voice) return null;
  if (!TTS_VOICES.some(v => v.value === voice)) return 'catalog';
  if (!supportsTtsVoice(effectiveTtsModel.value, voice)) return 'incompat';
  return null;
});

const isTtsVoiceStale = computed(() => ttsVoiceStaleReason.value !== null);

const onTextModelReset = () => {
  state.defaultTextModel = null;
};
const onVisionModelReset = () => {
  state.defaultVisionModel = null;
};
const onTtsModelReset = () => {
  state.defaultTtsModel = null;
};
const onTtsVoiceReset = () => {
  state.defaultTtsVoice = null;
};

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
    label: m.value === DEFAULT_TTS_MODEL ? `${m.name} (default)` : m.name,
    value: m.value,
  })),
);

// Filtered by current model: tts-1 / tts-1-hd reject the newer voices
// (cedar, marin, ballad, verse) with a 400. Picking model first then
// voice keeps the dropdown honest about what'll actually play.
// Iterating TTS_VOICES (not VOICES_BY_MODEL) preserves the canonical
// presentation order regardless of which model is selected.
const ttsVoiceItems = computed(() => {
  const supportedIds = new Set<TtsVoice>(VOICES_BY_MODEL[effectiveTtsModel.value]);
  return TTS_VOICES
    .filter(v => supportedIds.has(v.value))
    .map(v => ({
      label: v.value === DEFAULT_TTS_VOICE ? `${v.name} (default)` : v.name,
      value: v.value,
    }));
});

const effectiveTtsModel = computed<TtsModel>(
  () => state.defaultTtsModel ?? DEFAULT_TTS_MODEL,
);

// USelect's v-model uses `undefined` for "no selection". Translate
// null ↔ undefined at the boundary so `state` keeps the null sentinel
// that matches the API + schema.
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

// Revokes the blob URL so a fast re-click or component teardown
// doesn't accumulate leaks.
const stopPreviewAudio = () => {
  const audio = previewAudio.value;
  if (!audio) return;
  audio.pause();
  URL.revokeObjectURL(audio.src);
  previewAudio.value = null;
};

// The button doubles as a stop control while playback is active so
// the user can cut off a too-long sample without waiting.
const isPlaying = computed(() => !!previewAudio.value);

const onPreview = async () => {
  if (isPlaying.value) {
    stopPreviewAudio();
    return;
  }
  if (isPreviewing.value) return;
  isPreviewing.value = true;
  stopPreviewAudio();
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
    // `new Audio()` keeps playback off the DOM entirely. The button is
    // user-gesture-initiated, so the autoplay policy admits this call.
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener('ended', () => {
      if (previewAudio.value === audio) stopPreviewAudio();
    });
    previewAudio.value = audio;
    await audio.play();
  } catch (e) {
    notify.error('Preview failed', e);
  } finally {
    isPreviewing.value = false;
  }
};

const onSubmit = () => {
  emit('submit', { ...state });
};

onUnmounted(stopPreviewAudio);
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
      <UAlert
        v-if="isTextModelStale"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="`${state.defaultTextModel} is no longer available`"
        :description="`Reset to fermi's default (${defaultTextModelInfo.name}) or pick a new model from the list above.`"
        :actions="[{ label: 'Reset to default', color: 'warning', variant: 'soft', onClick: onTextModelReset }]"
        class="mt-2"
      />
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
      <UAlert
        v-if="isVisionModelStale"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="`${state.defaultVisionModel} is no longer available`"
        :description="`Reset to fermi's default (${defaultVisionModelInfo.name}) or pick a new model from the list above.`"
        :actions="[{ label: 'Reset to default', color: 'warning', variant: 'soft', onClick: onVisionModelReset }]"
        class="mt-2"
      />
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
        :placeholder="`${DEFAULT_TTS_MODEL_NAME} (default)`"
      />
      <UAlert
        v-if="isTtsModelStale"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="`${state.defaultTtsModel} is no longer available`"
        :description="`Reset to fermi's default (${DEFAULT_TTS_MODEL_NAME}) or pick a new model from the list above.`"
        :actions="[{ label: 'Reset to default', color: 'warning', variant: 'soft', onClick: onTtsModelReset }]"
        class="mt-2"
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
          :placeholder="`${DEFAULT_TTS_VOICE_NAME} (default)`"
          class="flex-1"
        />
        <UButton
          :icon="isPlaying ? 'i-lucide-square' : 'i-lucide-play'"
          color="neutral"
          variant="outline"
          :loading="isPreviewing"
          :aria-label="isPlaying ? 'Stop preview' : 'Preview voice'"
          @click="onPreview"
        />
      </div>
      <UAlert
        v-if="isTtsVoiceStale"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="ttsVoiceStaleReason === 'catalog'
          ? `${state.defaultTtsVoice} is no longer available`
          : `${state.defaultTtsVoice} doesn't work with ${effectiveTtsModel}`"
        :description="`Reset to fermi's default (${DEFAULT_TTS_VOICE_NAME}) or pick a new voice from the list above.`"
        :actions="[{ label: 'Reset to default', color: 'warning', variant: 'soft', onClick: onTtsVoiceReset }]"
        class="mt-2"
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
        placeholder="Speak calmly and warmly."
      />
    </UFormField>
  </UForm>
</template>
