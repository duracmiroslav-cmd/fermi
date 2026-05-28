<script setup lang="ts">
import { DEFAULT_VISION_MODEL, resolveTextModel } from '~~/shared/constants/models';

definePageMeta({ layout: false });

interface BotRef {
  id:          string;
  displayName: string | null;
  platform:    string;
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
);
const { data: models } = useApiFetch<ProviderModel[]>('/api/providers/openrouter/models');

// The effective text model a run uses: the agent's own pick, or the
// platform default when unset (the Default agent ships with none).
// Mirrors the vision row below, which already surfaces its fallback.
const model = computed<ProviderModel & { isDefault: boolean }>(() => {
  const { id, isDefault } = resolveTextModel(agent.value?.defaultTextModel ?? null);
  const found = (models.value ?? []).find(m => m.id === id)
    ?? { id, name: id, avatar: { icon: 'i-lucide-sparkles' } };
  return { ...found, isDefault };
});

// The worker swaps to this whenever a conversation includes an image.
// Falls back to the hardcoded default when the agent hasn't set one.
const visionModel = computed<ProviderModel>(() => {
  const id = agent.value?.defaultVisionModel ?? DEFAULT_VISION_MODEL;
  return (models.value ?? []).find(m => m.id === id)
    ?? { id, name: id, avatar: { icon: 'i-lucide-eye' } };
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
            <h1 class="text-2xl font-semibold truncate">
              {{ agent.name || '(unnamed)' }}
            </h1>
          </div>
          <UBadge
            v-if="agent.isDefault"
            color="neutral"
            variant="outline"
            size="sm"
            leading-icon="i-lucide-star"
            class="ml-auto shrink-0"
          >
            Default
          </UBadge>
        </div>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <p class="font-medium">
                System prompt
              </p>
              <UButton
                v-if="agent.systemPrompt"
                :to="`/dashboard/agents/${agent.id}/edit`"
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="sm"
              >
                Edit
              </UButton>
            </div>
          </template>
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

        <UCard>
          <template #header>
            <p class="font-medium">
              Details
            </p>
          </template>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm leading-7">
            <dt class="text-toned text-right">
              Model
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
                  class="truncate min-w-0 text-primary hover:underline"
                >
                  {{ model.name }}
                </NuxtLink>
                <UIcon
                  name="i-lucide-external-link"
                  class="size-3.5 shrink-0 text-toned"
                />
                <span
                  v-if="model.isDefault"
                  class="text-toned shrink-0"
                >
                  (default)
                </span>
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
                  class="truncate min-w-0 text-primary hover:underline"
                >
                  {{ visionModel.name }}
                </NuxtLink>
                <UIcon
                  name="i-lucide-external-link"
                  class="size-3.5 shrink-0 text-toned"
                />
              </div>
            </dd>
            <dt class="text-toned text-right">
              ID
            </dt>
            <dd class="text-highlighted break-all">
              {{ agent.id }}
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
          <p class="text-xs text-toned mt-2">
            Conversations that include an image are answered by the vision model, whatever the text model is set to.
          </p>
        </UCard>

        <AgentCapabilitiesReadonly :agent-id="agent.id" />

        <UCard v-if="agent.bots.length">
          <template #header>
            <p class="font-medium">
              Bots using this agent
            </p>
          </template>
          <div class="divide-y divide-default -mx-4 sm:-mx-6">
            <NuxtLink
              v-for="bot in agent.bots"
              :key="bot.id"
              :to="`/dashboard/bots/${bot.id}`"
              class="flex items-center gap-3 px-4 sm:px-6 py-3 hover:bg-elevated transition-colors"
            >
              <UIcon
                name="i-lucide-bot"
                class="size-4 text-toned shrink-0 mt-0.5"
              />
              <span class="text-sm flex-1 min-w-0 truncate">
                {{ bot.displayName || '(unnamed)' }}
              </span>
              <span class="text-xs text-toned shrink-0">
                {{ bot.platform }}
              </span>
            </NuxtLink>
          </div>
        </UCard>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
