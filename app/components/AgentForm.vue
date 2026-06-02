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
  getTtsModelName,
  getTtsVoiceName,
  supportsTtsInstructions,
  supportsTtsVoice,
} from '~~/shared/tts';

// `null` is the canonical "unset, use worker fallback" sentinel for
// every picker field. Form layer (USelect / USelectMenu) maps null ↔
// undefined at the display computeds; API boundary passes null
// through to the PATCH body, which the DB stores as NULL.
interface AgentFormValue {
  name:                 string;
  systemPrompt:         string;
  defaultTextModel:     string | null;
  defaultVisionModel:   string | null;
  defaultTtsModel:      TtsModel | null;
  defaultTtsVoice:      TtsVoice | null;
  ttsInstructions:      string;
  voiceReplyMode:       VoiceReplyMode;
  normalizeTraditional: boolean;
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

const { t } = useI18n();
const notify = useNotify();

const { data: models, pending: modelsPending, refresh: refreshModels } = useApiFetch<ProviderModel[]>('/api/providers/openrouter/models');

const formatContext = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M context` : `${Math.round(n / 1000)}k context`;

const state = reactive<AgentFormValue>({
  name:             props.initialValue?.name ?? '',
  systemPrompt:     props.initialValue?.systemPrompt ?? '',
  defaultTextModel: props.initialValue
    ? (props.initialValue.defaultTextModel ?? null)
    : DEFAULT_TEXT_MODEL,
  defaultVisionModel: props.initialValue
    ? (props.initialValue.defaultVisionModel ?? null)
    : DEFAULT_VISION_MODEL,
  // TTS fields stay null on new agents so the worker fallback wins;
  // the placeholder copy surfaces what that fallback resolves to.
  defaultTtsModel:      props.initialValue?.defaultTtsModel ?? null,
  defaultTtsVoice:      props.initialValue?.defaultTtsVoice ?? null,
  ttsInstructions:      props.initialValue?.ttsInstructions ?? '',
  voiceReplyMode:       props.initialValue?.voiceReplyMode ?? 'off',
  normalizeTraditional: props.initialValue?.normalizeTraditional ?? true,
});

const isTextModelPickerOpening = ref(false);
const isVisionModelPickerOpening = ref(false);
const isRefreshing = ref(false);
// Tracked per-voice, not as a bare boolean, so only the clicked item's
// play button shows its loading / stop state. `previewAudio` is the one
// in-flight element, kept so the next click can cut off the prior sample.
const previewingVoice = ref<TtsVoice | null>(null);
const playingVoice = ref<TtsVoice | null>(null);
const previewAudio = ref<HTMLAudioElement | null>(null);

// Behavioral toggles (voice reply, Traditional conversion) only render
// when editing. The create form stays light — they fall back to their
// column defaults (off / on) and get tuned later. initialValue is
// present only on the edit page.
const isEditing = computed(() => props.initialValue != null);

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

const isTextModelFree = computed(() => selectedTextModel.value?.isFree ?? false);

const isVisionModelStale = computed(() =>
  !modelsPending.value
  && !!models.value
  && !!state.defaultVisionModel
  && !selectedVisionModel.value,
);

const isVisionModelFree = computed(() => selectedVisionModel.value?.isFree ?? false);

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
const ttsVoiceStaleReason = computed<'missing' | 'unsupported' | null>(() => {
  const voice = state.defaultTtsVoice;
  if (!voice) return null;
  if (!TTS_VOICES.some(v => v.value === voice)) return 'missing';
  if (!supportsTtsVoice(effectiveTtsModel.value, voice)) return 'unsupported';
  return null;
});

const isTtsVoiceStale = computed(() => ttsVoiceStaleReason.value !== null);

// Display names mirror dropdown labels so warning copy reads as one
// surface (e.g. "Cedar doesn't work with TTS-1" instead of the
// lowercase wire ids). getTts*Name falls back to the raw id when the
// stored value is no longer in the catalog — informative without
// crashing.
const ttsVoiceName = computed(() =>
  state.defaultTtsVoice ? getTtsVoiceName(state.defaultTtsVoice) : '',
);
const ttsModelName = computed(() => getTtsModelName(effectiveTtsModel.value));

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

// Fires only when the user picks a TTS model in the dropdown — Reset
// buttons write state directly and don't emit this event. Clearing an
// incompat voice here keeps the saved state in a shape the runtime
// won't have to silently fall back on.
const onTtsModelPick = (next: TtsModel | undefined) => {
  const voice = state.defaultTtsVoice;
  if (next && voice && !supportsTtsVoice(next, voice)) {
    state.defaultTtsVoice = null;
  }
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
    label: m.value === DEFAULT_TTS_MODEL ? `${m.name} ${t('__labelDefaultSuffix')}` : m.name,
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
      label: v.value === DEFAULT_TTS_VOICE ? `${v.name} ${t('__labelDefaultSuffix')}` : v.name,
      value: v.value,
    }));
});

const voiceReplyModeItems = computed(() => [
  { label: t('__labelOff'), value: 'off' as const, description: t('__hintVoiceReplyOffDescription') },
  { label: t('__labelAuto'), value: 'auto' as const, description: t('__hintVoiceReplyAutoDescription') },
  { label: t('__labelAlways'), value: 'always' as const, description: t('__hintVoiceReplyAlwaysDescription') },
]);

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
// the value won't be honored without discarding it on submit.
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
  playingVoice.value = null;
};

const onPreview = async (voice: TtsVoice) => {
  if (playingVoice.value === voice) {
    stopPreviewAudio();
    return;
  }
  if (previewingVoice.value) return;
  stopPreviewAudio();
  previewingVoice.value = voice;
  try {
    const blob = await $fetch<Blob>('/api/agents/preview-tts', {
      method: 'POST',
      body:   {
        model:        effectiveTtsModel.value,
        voice,
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
    playingVoice.value = voice;
    await audio.play();
  } catch (e) {
    notify.error(t('__toastPreviewFailed'), e);
  } finally {
    previewingVoice.value = null;
  }
};

// A sample playing in the dropdown loses its stop control once the menu
// closes, so cut it on dismiss.
const onVoiceMenuToggle = (open: boolean) => {
  if (!open) stopPreviewAudio();
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
      :label="$t('__labelName')"
      name="name"
      required
      :help="$t('__hintAgentName')"
    >
      <UInput
        v-model.trim="state.name"
        :placeholder="$t('__placeholderAgentName')"
      />
    </UFormField>

    <UFormField
      :label="$t('__labelSystemPrompt')"
      name="systemPrompt"
      :help="$t('__hintSystemPrompt')"
    >
      <template #hint>
        <span class="text-sm text-toned">
          {{ $t('__hintSystemPromptCharCount', { count: promptCharCount }) }}
        </span>
      </template>
      <UTextarea
        v-model.trim="state.systemPrompt"
        :rows="12"
        :placeholder="$t('__placeholderSystemPrompt')"
      />
    </UFormField>

    <div class="flex flex-col gap-2">
      <UFormField
        :label="$t('__labelTextModel', 1)"
        name="defaultTextModel"
        :help="$t('__hintTextModel')"
      >
        <USelectMenu
          v-model="displayTextModelId"
          :items="allModelItems"
          value-key="value"
          :placeholder="`${defaultTextModelInfo.name} ${t('__labelDefaultSuffix')}`"
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
                {{ allModelItems.length }} {{ $t('__labelTextModel', allModelItems.length) }}
              </span>
              <UButton
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                size="xs"
                :label="$t('__actionRefresh')"
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
            <span v-if="modelsPending">{{ $t('__hintLoadingModels') }}</span>
            <span v-else-if="searchTerm">{{ $t('__descriptionNoModelsMatchSearch', { query: searchTerm }) }}</span>
            <span v-else>{{ $t('__descriptionNoModelsAvailable') }}</span>
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
                {{ $t('__labelFree') }}
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
            <UTooltip :text="$t('__actionViewOnOpenrouter')">
              <UButton
                :to="`https://openrouter.ai/${item.value}`"
                target="_blank"
                rel="noopener"
                icon="i-lucide-external-link"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="$t('__actionViewOnOpenrouter')"
                class="hover:bg-accented! group-data-[state=checked]:hover:bg-primary/20!"
                @click.stop
                @pointerdown.stop
              />
            </UTooltip>
          </template>
        </USelectMenu>
      </UFormField>
      <UAlert
        v-if="isTextModelStale"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="$t('__descriptionModelUnavailable', { name: state.defaultTextModel })"
        :description="$t('__descriptionModelStaleResetCta', { name: defaultTextModelInfo.name })"
        :actions="[{ label: $t('__actionResetToDefault'), color: 'warning', variant: 'soft', onClick: onTextModelReset }]"
      />
      <UAlert
        v-else-if="isTextModelFree"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :description="$t('__hintFreeModelRateLimited')"
      />
    </div>

    <div class="flex flex-col gap-2">
      <UFormField
        :label="$t('__labelVisionModel', 1)"
        name="defaultVisionModel"
        :help="$t('__hintVisionModel')"
      >
        <USelectMenu
          v-model="displayVisionModelId"
          :items="visionModelItems"
          value-key="value"
          :placeholder="`${defaultVisionModelInfo.name} ${t('__labelDefaultSuffix')}`"
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
                {{ visionModelItems.length }} {{ $t('__labelVisionModel', visionModelItems.length) }}
              </span>
              <UButton
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                size="xs"
                :label="$t('__actionRefresh')"
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
            <span v-if="modelsPending">{{ $t('__hintLoadingModels') }}</span>
            <span v-else-if="searchTerm">{{ $t('__descriptionNoModelsMatchSearch', { query: searchTerm }) }}</span>
            <span v-else>{{ $t('__descriptionNoVisionModelsAvailable') }}</span>
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
                {{ $t('__labelFree') }}
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
            <UTooltip :text="$t('__actionViewOnOpenrouter')">
              <UButton
                :to="`https://openrouter.ai/${item.value}`"
                target="_blank"
                rel="noopener"
                icon="i-lucide-external-link"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="$t('__actionViewOnOpenrouter')"
                class="hover:bg-accented! group-data-[state=checked]:hover:bg-primary/20!"
                @click.stop
                @pointerdown.stop
              />
            </UTooltip>
          </template>
        </USelectMenu>
      </UFormField>
      <UAlert
        v-if="isVisionModelStale"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="$t('__descriptionModelUnavailable', { name: state.defaultVisionModel })"
        :description="$t('__descriptionModelStaleResetCta', { name: defaultVisionModelInfo.name })"
        :actions="[{ label: $t('__actionResetToDefault'), color: 'warning', variant: 'soft', onClick: onVisionModelReset }]"
      />
      <UAlert
        v-else-if="isVisionModelFree"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :description="$t('__hintFreeModelRateLimited')"
      />
    </div>

    <UFormField
      v-if="isEditing"
      :label="$t('__labelNormalizeTraditional')"
      name="normalizeTraditional"
      :help="$t('__hintNormalizeTraditional')"
    >
      <USwitch v-model="state.normalizeTraditional" />
    </UFormField>

    <UFormField
      v-if="isEditing"
      :label="$t('__labelVoiceReply')"
      name="voiceReplyMode"
      :help="$t('__hintVoiceReply')"
    >
      <URadioGroup
        v-model="state.voiceReplyMode"
        :items="voiceReplyModeItems"
      />
    </UFormField>

    <UFormField
      :label="$t('__labelVoiceModel', 1)"
      name="defaultTtsModel"
      :help="$t('__hintTtsModel')"
    >
      <USelectMenu
        v-model="displayTtsModel"
        :items="ttsModelItems"
        value-key="value"
        :placeholder="`${DEFAULT_TTS_MODEL_NAME} ${t('__labelDefaultSuffix')}`"
        @update:model-value="onTtsModelPick"
      >
        <template #content-top>
          <div class="px-2 py-1.5 border-b border-default">
            <span class="text-xs">
              {{ ttsModelItems.length }} {{ $t('__labelVoiceModel', ttsModelItems.length) }}
            </span>
          </div>
        </template>
        <template #leading>
          <UIcon
            name="i-simple-icons-openai"
            class="size-5 text-toned"
          />
        </template>
        <template #item-leading>
          <UIcon
            name="i-simple-icons-openai"
            class="size-5 text-toned"
          />
        </template>
      </USelectMenu>
      <UAlert
        v-if="isTtsModelStale"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="$t('__descriptionModelUnavailable', { name: state.defaultTtsModel })"
        :description="$t('__descriptionModelStaleResetCta', { name: DEFAULT_TTS_MODEL_NAME })"
        :actions="[{ label: $t('__actionResetToDefault'), color: 'warning', variant: 'soft', onClick: onTtsModelReset }]"
        class="mt-2"
      />
    </UFormField>

    <UFormField
      :label="$t('__labelVoice', 1)"
      name="defaultTtsVoice"
      :help="$t('__hintTtsVoice')"
    >
      <USelectMenu
        v-model="displayTtsVoice"
        :items="ttsVoiceItems"
        value-key="value"
        :placeholder="`${DEFAULT_TTS_VOICE_NAME} ${t('__labelDefaultSuffix')}`"
        :ui="{ itemTrailingIcon: 'hidden' }"
        @update:open="onVoiceMenuToggle"
      >
        <template #content-top>
          <div class="px-2 py-1.5 border-b border-default">
            <span class="text-xs">
              {{ ttsVoiceItems.length }} {{ $t('__labelVoice', ttsVoiceItems.length) }}
            </span>
          </div>
        </template>
        <template #leading>
          <VoiceAvatar
            :seed="state.defaultTtsVoice || DEFAULT_TTS_VOICE"
            size="2xs"
          />
        </template>
        <template #item-leading="{ item }">
          <VoiceAvatar
            :seed="item.value"
            size="2xs"
          />
        </template>
        <template #item-trailing="{ item }">
          <!-- size-7 box aligns the check with the trailing button -->
          <span class="flex items-center justify-center size-7 shrink-0">
            <UIcon
              v-if="state.defaultTtsVoice === item.value"
              name="i-lucide-check"
              class="size-4"
            />
          </span>
          <UTooltip :text="playingVoice === item.value ? $t('__actionStopPreview') : $t('__actionPreviewVoice')">
            <UButton
              :icon="playingVoice === item.value ? 'i-lucide-square' : 'i-lucide-play'"
              color="neutral"
              variant="ghost"
              size="sm"
              :loading="previewingVoice === item.value"
              :aria-label="playingVoice === item.value ? $t('__actionStopPreview') : $t('__actionPreviewVoice')"
              class="hover:bg-accented! group-data-[state=checked]:hover:bg-primary/20!"
              @click.stop="onPreview(item.value as TtsVoice)"
              @pointerdown.stop
            />
          </UTooltip>
        </template>
      </USelectMenu>
      <UAlert
        v-if="isTtsVoiceStale"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="ttsVoiceStaleReason === 'missing'
          ? $t('__descriptionModelUnavailable', { name: ttsVoiceName })
          : $t('__descriptionVoiceUnsupported', { voice: ttsVoiceName, model: ttsModelName })"
        :description="$t('__descriptionVoiceStaleResetCta', { name: DEFAULT_TTS_VOICE_NAME })"
        :actions="[{ label: $t('__actionResetToDefault'), color: 'warning', variant: 'soft', onClick: onTtsVoiceReset }]"
        class="mt-2"
      />
    </UFormField>

    <UFormField
      :label="$t('__labelVoiceInstructions')"
      name="ttsInstructions"
      :help="$t(isInstructionsSupported ? '__hintTtsVoiceInstructionsSupported' : '__hintTtsVoiceInstructionsUnsupported')"
    >
      <UTextarea
        v-model.trim="state.ttsInstructions"
        :rows="3"
        :disabled="!isInstructionsSupported"
        :placeholder="$t('__placeholderTtsInstructions')"
      />
    </UFormField>
  </UForm>
</template>
