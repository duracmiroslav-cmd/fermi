<script setup lang="ts">
import { DEFAULT_VISION_MODEL, resolveTextModel } from '~~/shared/constants/models';

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
  avatarUrl:          string | null;
  isDefault:          boolean;
  createdAt:          string;
  updatedAt:          string;
  bots:               BotRef[];
}

interface ProviderModel {
  id:     string;
  name:   string;
  avatar: { icon: string };
}

const route = useRoute();

const { data: agent, error, pending } = useApiFetch<AgentDetail>(
  () => `/api/agents/${route.params.id}`,
  { key: route.params.id as string },
);
const { data: models } = useApiFetch<ProviderModel[]>('/api/providers/openrouter/models');
const { data: openrouter, pending: openrouterPending } = useApiFetch<{ connected: boolean }>(
  '/api/oauth/openrouter',
);

const statusOf = (bot: BotRef) => deriveBotStatus(
  bot,
  !!openrouter.value?.connected,
  openrouterPending.value && openrouter.value === undefined,
);
const statusDot = (bot: BotRef) => {
  const s = statusOf(bot);
  return s ? BOT_STATUS_DOT[s] : 'bg-muted animate-pulse';
};
const statusAria = (bot: BotRef) => {
  const s = statusOf(bot);
  return s ? BOT_STATUS_LABEL[s] : 'Loading status';
};

// OpenRouter names come as "Provider: Model"; the provider logo already
// carries the provider so we strip the prefix to avoid duplicating it.
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
            { label: 'Agents', to: '/dashboard/agents' },
            { label: agent?.name ?? '' },
          ]"
          :loading="!agent"
        />
      </template>

      <DashboardDetailSkeleton
        v-if="pending && !agent"
        :fields="3"
      />

      <DashboardContainer v-else-if="error">
        <UEmpty
          variant="subtle"
          icon="i-lucide-search-x"
          title="Agent not found"
          description="This agent may have been deleted, or the link is wrong."
          :actions="[{ label: 'Back to agents', icon: 'i-lucide-arrow-left', to: '/dashboard/agents' }]"
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
              {{ agent.name || '(unnamed)' }}
              <UBadge
                v-if="agent.isDefault"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                Default
              </UBadge>
            </h1>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-semibold">
              System prompt
            </h2>
            <UButton
              v-if="agent.systemPrompt"
              :to="`/dashboard/agents/${agent.id}/edit`"
              icon="i-lucide-square-pen"
              color="neutral"
              variant="soft"
              size="sm"
            >
              Edit
            </UButton>
          </div>
          <UCard>
            <p
              v-if="agent.systemPrompt"
              class="text-sm text-highlighted whitespace-pre-wrap break-words leading-relaxed"
            >
              {{ agent.systemPrompt }}
            </p>
            <div
              v-else
              class="flex flex-col items-start gap-3"
            >
              <p class="text-sm text-toned">
                No system prompt set. This agent replies with default behavior.
              </p>
              <UButton
                :to="`/dashboard/agents/${agent.id}/edit`"
                icon="i-lucide-plus"
                size="sm"
              >
                Add system prompt
              </UButton>
            </div>
          </UCard>
        </div>

        <div class="flex flex-col gap-3">
          <h2 class="font-semibold">
            Details
          </h2>
          <UCard>
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm leading-7">
            <dt class="text-toned text-right">
              Text model
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
                  <span class="truncate">{{ model.isDefault ? `${model.name} (default)` : model.name }}</span>
                  <UIcon
                    name="i-lucide-external-link"
                    class="size-3.5 shrink-0 text-toned"
                  />
                </NuxtLink>
              </div>
            </dd>
            <dt class="text-toned text-right">
              Vision model
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
              Created
            </dt>
            <dd class="text-highlighted">
              <TimeAgo :date="agent.createdAt" />
            </dd>
            <dt class="text-toned text-right">
              Updated
            </dt>
            <dd class="text-highlighted">
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
            Bots using this agent
          </h2>
          <div class="space-y-2">
            <NuxtLink
              v-for="bot in agent.bots"
              :key="bot.id"
              :to="`/dashboard/bots/${bot.id}`"
              class="block"
            >
              <UCard class="hover:bg-elevated transition-colors">
                <div class="flex items-center gap-4">
                  <div class="relative shrink-0">
                    <UAvatar
                      v-if="bot.avatarUrl"
                      :src="bot.avatarUrl"
                      size="lg"
                    />
                    <div
                      v-else
                      class="size-9 rounded-full bg-primary/10 flex items-center justify-center font-mono text-sm font-semibold text-primary"
                    >
                      {{ (bot.displayName ?? '?').charAt(0).toUpperCase() }}
                    </div>
                    <span
                      class="absolute bottom-0 right-0 size-3 rounded-full ring-2 ring-default"
                      :class="statusDot(bot)"
                      :aria-label="statusAria(bot)"
                    />
                  </div>
                  <div class="flex-1 min-w-0 flex flex-col gap-0.5">
                    <p class="font-medium truncate">
                      {{ bot.displayName || '(unnamed)' }}
                    </p>
                    <div class="flex items-center gap-3 min-w-0 text-sm text-toned">
                      <PlatformLabel
                        :platform="bot.platform"
                        class="shrink-0"
                      />
                    </div>
                  </div>
                  <span
                    v-if="bot.lastRepliedAt"
                    class="text-xs text-toned shrink-0"
                  >
                    Replied <TimeAgo :date="bot.lastRepliedAt" />
                  </span>
                  <span
                    v-else
                    class="text-xs text-toned shrink-0"
                  >
                    No replies yet
                  </span>
                </div>
              </UCard>
            </NuxtLink>
          </div>
        </div>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
