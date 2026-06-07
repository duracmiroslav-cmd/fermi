<script setup lang="ts">
import type { VoiceReplyMode } from '~~/shared/agents';
import type { TtsModel, TtsVoice } from '~~/shared/tts';

definePageMeta({ layout: false });

interface AgentDetail {
  id:                   string;
  name:                 string;
  systemPrompt:         string | null;
  defaultTextModel:     string | null;
  defaultVisionModel:   string | null;
  defaultTtsModel:      TtsModel | null;
  defaultTtsVoice:      TtsVoice | null;
  ttsInstructions:      string | null;
  voiceReplyMode:       VoiceReplyMode;
  normalizeTraditional: boolean;
  avatarUrl:            string | null;
  isDefault:            boolean;
  bots:                 Array<{ id: string; displayName: string | null; platform: string }>;
}

const route = useRoute();
const { t } = useI18n();
const notify = useNotify();

const { update, remove, isSubmitting, isDeleting } = useAgents();

const { data: agent, error, pending } = useApiFetch<AgentDetail>(
  () => `/api/agents/${route.params.id}`,
);

const deleteDialogOpen = ref(false);

const onSubmit = async (value: {
  name:                 string;
  systemPrompt:         string;
  defaultTextModel:     string | null;
  defaultVisionModel:   string | null;
  defaultTtsModel:      TtsModel | null;
  defaultTtsVoice:      TtsVoice | null;
  ttsInstructions:      string;
  voiceReplyMode:       VoiceReplyMode;
  normalizeTraditional: boolean;
}) => {
  const id = route.params.id as string;
  const ok = await update(id, {
    name:                 value.name,
    systemPrompt:         value.systemPrompt || null,
    defaultTextModel:     value.defaultTextModel,
    defaultVisionModel:   value.defaultVisionModel,
    defaultTtsModel:      value.defaultTtsModel,
    defaultTtsVoice:      value.defaultTtsVoice,
    ttsInstructions:      value.ttsInstructions || null,
    voiceReplyMode:       value.voiceReplyMode,
    normalizeTraditional: value.normalizeTraditional,
  });
  if (ok) await navigateTo(`/dashboard/agents/${id}`);
};

const onAvatarChange = async (url: string | null) => {
  try {
    await $fetch(`/api/agents/${route.params.id}`, {
      method: 'PATCH',
      body:   { avatarUrl: url },
    });
    if (agent.value) agent.value.avatarUrl = url;
    notify.success(url ? t('__toastAvatarUpdated') : t('__toastAvatarRemoved'));
  } catch (e) {
    notify.error(t('__toastAvatarUpdateFailed'), e);
  }
};

const onDelete = async () => {
  if (await remove(route.params.id as string)) await navigateTo('/dashboard/agents');
};
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb
          :items="[
            { label: $t('__labelAgent', 2), to: '/dashboard' },
            { label: agent?.name ?? '', to: `/dashboard/agents/${route.params.id}` },
            { label: $t('__actionEdit') },
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
          :actions="[{ label: $t('__actionBackToAgents'), icon: 'i-lucide-arrow-left', to: '/dashboard' }]"
        />
      </DashboardContainer>

      <DashboardContainer v-if="agent">
        <div class="flex items-center gap-4">
          <div class="size-12 shrink-0">
            <AgentAvatarUpload
              :agent-id="agent.id"
              :current-url="agent.avatarUrl"
              @change="onAvatarChange"
            />
          </div>
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
            <h2 class="font-semibold flex items-center gap-2">
              <UIcon
                name="i-lucide-settings"
                class="size-4 text-toned"
              />
              {{ $t('__titleSettings') }}
            </h2>
            <div class="flex items-center gap-2">
              <UButton
                :to="`/dashboard/agents/${agent.id}`"
                color="neutral"
                variant="outline"
                size="sm"
              >
                {{ $t('__actionCancel') }}
              </UButton>
              <UButton
                type="submit"
                form="agent-form"
                :loading="isSubmitting"
                size="sm"
              >
                {{ $t('__actionSave') }}
              </UButton>
            </div>
          </div>
          <UCard>
            <AgentForm
              form-id="agent-form"
              :initial-value="{
                name: agent.name,
                systemPrompt: agent.systemPrompt ?? '',
                defaultTextModel: agent.defaultTextModel,
                defaultVisionModel: agent.defaultVisionModel,
                defaultTtsModel: agent.defaultTtsModel,
                defaultTtsVoice: agent.defaultTtsVoice,
                ttsInstructions: agent.ttsInstructions ?? '',
                voiceReplyMode: agent.voiceReplyMode,
                normalizeTraditional: agent.normalizeTraditional,
              }"
              @submit="onSubmit"
            />
          </UCard>
        </div>

        <AgentCapabilities :agent-id="agent.id" />

        <div
          v-if="!agent.isDefault"
          class="flex flex-col gap-3"
        >
          <h2 class="font-semibold text-error flex items-center gap-2">
            <UIcon
              name="i-lucide-triangle-alert"
              class="size-4"
            />
            {{ $t('__titleDangerZone') }}
          </h2>
          <UCard>
            <div class="grid grid-cols-12 gap-4 md:items-center">
              <div class="col-span-12 md:col-span-9 min-w-0">
                <p class="text-sm font-medium">
                  {{ $t('__titleDeleteAgent') }}
                </p>
                <p class="text-xs text-toned mt-1">
                  <template v-if="agent.bots.length">
                    {{ $t('__descriptionAgentBoundToBots', { count: agent.bots.length }, agent.bots.length) }}
                  </template>
                  <template v-else>
                    {{ $t('__descriptionDeleteAgent') }}
                  </template>
                </p>
              </div>
              <div class="col-span-12 md:col-span-3 justify-self-end">
                <UTooltip
                  v-if="agent.bots.length"
                  :text="$t('__hintAgentBoundToBot')"
                >
                  <UButton
                    color="error"
                    variant="outline"
                    size="sm"
                    disabled
                  >
                    {{ $t('__actionDeleteAgent') }}
                  </UButton>
                </UTooltip>
                <UButton
                  v-else
                  color="error"
                  variant="outline"
                  size="sm"
                  @click="deleteDialogOpen = true"
                >
                  {{ $t('__actionDeleteAgent') }}
                </UButton>
              </div>
            </div>
          </UCard>
        </div>

        <DeleteConfirmDialog
          v-model:open="deleteDialogOpen"
          :title="$t('__titleDeleteAgent')"
          :item-name="agent.name"
          :confirm-label="$t('__actionDelete')"
          :loading="isDeleting"
          @confirm="onDelete"
        >
          <I18nT
            keypath="__descriptionDeleteAgentConfirm"
            tag="p"
          >
            <template #name>
              <span class="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{{ agent.name }}</span>
            </template>
          </I18nT>
        </DeleteConfirmDialog>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
