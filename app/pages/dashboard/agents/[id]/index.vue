<script setup lang="ts">
import type { VoiceReplyMode } from '~~/shared/agents';
import { DEFAULT_VISION_MODEL, resolveTextModel } from '~~/shared/constants/models';
import {
  DEFAULT_TTS_MODEL_NAME,
  DEFAULT_TTS_VOICE_NAME,
  type TtsModel,
  type TtsVoice,
  getTtsModelName,
  getTtsVoiceName,
} from '~~/shared/tts';

definePageMeta({ layout: false });

interface BotRef {
  id:                string;
  displayName:       string | null;
  platform:          string;
  avatarUrl:         string | null;
  disabledAt:        string | null;
  webhookVerifiedAt: string | null;
  lastRepliedAt:     string | null;
}

interface AgentDetail {
  id:                 string;
  name:               string;
  systemPrompt:       string | null;
  defaultTextModel:   string | null;
  defaultVisionModel: string | null;
  defaultTtsModel:    TtsModel | null;
  defaultTtsVoice:    TtsVoice | null;
  ttsInstructions:    string | null;
  voiceReplyMode:     VoiceReplyMode;
  avatarUrl:          string | null;
  isDefault:          boolean;
  createdAt:          string;
  updatedAt:          string;
  bots:               BotRef[];
}

// Maps voice-reply mode to an i18n key. Detail page shows the
// full-prose form; the radio picker in AgentForm shows the short form
// (Off / Auto / Always) with separate description text.
const VOICE_REPLY_LABEL_KEY: Record<VoiceReplyMode, string> = {
  off:    '__labelOff',
  auto:   '__labelAutoMirror',
  always: '__labelAlways',
};

interface ProviderModel {
  id:     string;
  name:   string;
  avatar: { icon: string };
}

const route = useRoute();
const { t } = useI18n();

const { data: agent, error, pending } = useApiFetch<AgentDetail>(
  () => `/api/agents/${route.params.id}`,
  { key: route.params.id as string },
);
const { data: models } = useApiFetch<ProviderModel[]>('/api/providers/openrouter/models');

// OpenRouter names come as "Provider: Model"; the provider logo already
// carries the provider, so the prefix is stripped to avoid duplicating it.
const stripProviderPrefix = (name: string) => name.replace(/^[^:]+:\s*/, '');

// The effective text model a run uses: the agent's own pick, or the
// platform default when unset (the Default agent ships with none).
// Mirrors the vision row below, which already surfaces its fallback.
const model = computed<ProviderModel & { isDefault: boolean }>(() => {
  const { id, isDefault } = resolveTextModel(agent.value?.defaultTextModel ?? null);
  const found = (models.value ?? []).find(m => m.id === id)
    ?? { id, name: id, avatar: { icon: 'i-lucide-sparkles' } };
  return { ...found, name: stripProviderPrefix(found.name), isDefault };
});

// The worker swaps to this whenever a conversation includes an image.
// Falls back to the hardcoded default when the agent hasn't set one.
const visionModel = computed<ProviderModel>(() => {
  const id = agent.value?.defaultVisionModel ?? DEFAULT_VISION_MODEL;
  const found = (models.value ?? []).find(m => m.id === id)
    ?? { id, name: id, avatar: { icon: 'i-lucide-eye' } };
  return { ...found, name: stripProviderPrefix(found.name) };
});
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb
          :items="[
            { label: $t('__labelAgent', 2), to: '/dashboard/agents' },
            { label: agent?.name ?? '' },
          ]"
          :loading="!agent"
        />
      </template>

      <DashboardDetailSkeleton v-if="pending && !agent" />

      <DashboardContainer v-else-if="error">
        <UEmpty
          variant="subtle"
          icon="i-lucide-search-x"
          :title="$t('__titleAgentNotFound')"
          :description="$t('__descriptionAgentNotFound')"
          :actions="[{ label: $t('__actionBackToAgents'), icon: 'i-lucide-arrow-left', to: '/dashboard/agents' }]"
        />
      </DashboardContainer>

      <DashboardContainer v-if="agent">
        <div class="flex items-center gap-4">
          <AgentAvatar
            :src="agent.avatarUrl"
            :name="agent.name"
            :seed="agent.id"
            size="3xl"
          />
          <div class="min-w-0">
            <h1 class="text-2xl font-semibold truncate flex items-center gap-2">
              {{ agent.name || $t('__labelUnnamed') }}
              <UBadge
                v-if="agent.isDefault"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                {{ $t('__labelDefault') }}
              </UBadge>
            </h1>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-semibold">
              {{ $t('__labelSystemPrompt') }}
            </h2>
            <UButton
              v-if="agent.systemPrompt"
              :to="`/dashboard/agents/${agent.id}/edit`"
              icon="i-lucide-square-pen"
              color="neutral"
              variant="soft"
              size="sm"
            >
              {{ $t('__actionEdit') }}
            </UButton>
          </div>
          <UCard>
            <p
              v-if="agent.systemPrompt"
              class="text-sm whitespace-pre-wrap break-words leading-relaxed"
            >
              {{ agent.systemPrompt }}
            </p>
            <div
              v-else
              class="flex flex-col items-start gap-3"
            >
              <p class="text-sm text-toned">
                {{ $t('__descriptionNoSystemPrompt') }}
              </p>
              <UButton
                :to="`/dashboard/agents/${agent.id}/edit`"
                icon="i-lucide-plus"
                size="sm"
              >
                {{ $t('__actionAddSystemPrompt') }}
              </UButton>
            </div>
          </UCard>
        </div>

        <div class="flex flex-col gap-3">
          <h2 class="font-semibold">
            {{ $t('__titleDetails') }}
          </h2>
          <UCard>
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm leading-7">
              <dt class="text-toned text-right">
                {{ $t('__labelTextModel', 1) }}
              </dt>
              <dd class="min-w-0">
                <div class="flex items-center gap-1.5 min-w-0">
                  <UIcon
                    :name="model.avatar.icon"
                    class="size-5 text-toned shrink-0"
                  />
                  <NuxtLink
                    :to="`https://openrouter.ai/${model.id}`"
                    target="_blank"
                    rel="noopener"
                    class="flex items-center gap-1.5 min-w-0 text-primary hover:underline"
                  >
                    <span class="truncate">{{ model.isDefault ? `${model.name} ${t('__labelDefaultSuffix')}` : model.name }}</span>
                    <UIcon
                      name="i-lucide-external-link"
                      class="size-3.5 shrink-0 text-toned"
                    />
                  </NuxtLink>
                </div>
              </dd>
              <dt class="text-toned text-right">
                {{ $t('__labelVisionModel', 1) }}
              </dt>
              <dd class="min-w-0">
                <div class="flex items-center gap-1.5 min-w-0">
                  <UIcon
                    :name="visionModel.avatar.icon"
                    class="size-5 text-toned shrink-0"
                  />
                  <NuxtLink
                    :to="`https://openrouter.ai/${visionModel.id}`"
                    target="_blank"
                    rel="noopener"
                    class="flex items-center gap-1.5 min-w-0 text-primary hover:underline"
                  >
                    <span class="truncate">{{ visionModel.name }}</span>
                    <UIcon
                      name="i-lucide-external-link"
                      class="size-3.5 shrink-0 text-toned"
                    />
                  </NuxtLink>
                </div>
              </dd>
              <dt class="text-toned text-right">
                {{ $t('__labelVoiceReply') }}
              </dt>
              <dd>
                {{ $t(VOICE_REPLY_LABEL_KEY[agent.voiceReplyMode]) }}
              </dd>
              <dt class="text-toned text-right">
                {{ $t('__labelVoiceModel', 1) }}
              </dt>
              <dd>
                <span v-if="agent.defaultTtsModel">{{ getTtsModelName(agent.defaultTtsModel) }}</span>
                <span
                  v-else
                  class="text-toned"
                >{{ DEFAULT_TTS_MODEL_NAME }} {{ $t('__labelDefaultSuffix') }}</span>
              </dd>
              <dt class="text-toned text-right">
                {{ $t('__labelVoice', 1) }}
              </dt>
              <dd>
                <span v-if="agent.defaultTtsVoice">{{ getTtsVoiceName(agent.defaultTtsVoice) }}</span>
                <span
                  v-else
                  class="text-toned"
                >{{ DEFAULT_TTS_VOICE_NAME }} {{ $t('__labelDefaultSuffix') }}</span>
              </dd>
              <dt class="text-toned text-right">
                {{ $t('__labelVoiceInstructions') }}
              </dt>
              <dd class="min-w-0">
                <span
                  v-if="agent.ttsInstructions"
                  class="whitespace-pre-wrap"
                >{{ agent.ttsInstructions }}</span>
                <span
                  v-else
                  class="text-muted"
                >—</span>
              </dd>
              <dt class="text-toned text-right">
                {{ $t('__labelCreated') }}
              </dt>
              <dd>
                <TimeAgo :date="agent.createdAt" />
              </dd>
              <dt class="text-toned text-right">
                {{ $t('__labelUpdated') }}
              </dt>
              <dd>
                <TimeAgo :date="agent.updatedAt" />
              </dd>
            </dl>
          </UCard>
        </div>

        <AgentCapabilitiesReadonly :agent-id="agent.id" />

        <div
          v-if="agent.bots.length"
          class="flex flex-col gap-3"
        >
          <h2 class="font-semibold">
            {{ $t('__labelBot', 2) }}
          </h2>
          <div class="space-y-2">
            <BotListCard
              v-for="bot in agent.bots"
              :key="bot.id"
              :bot="bot"
            />
          </div>
        </div>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
