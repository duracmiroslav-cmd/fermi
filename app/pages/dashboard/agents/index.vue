<script setup lang="ts">
import { resolveTextModel } from '~~/shared/constants/models';

definePageMeta({ layout: false });

interface AgentRow {
  id:               string;
  name:             string;
  systemPrompt:     string | null;
  defaultTextModel: string | null;
  avatarUrl:        string | null;
  isDefault:        boolean;
  createdAt:        string;
  updatedAt:        string;
}

interface ProviderModel {
  id:     string;
  name:   string;
  avatar: { icon: string };
}

const { items: agents, used, atLimit, pending, limitMessage } = useTierLimit<AgentRow>('agents');
const { data: models } = useApiFetch<ProviderModel[]>('/api/providers/openrouter/models');

const search = ref('');

const filteredAgents = computed(() => {
  const q = search.value.toLowerCase();
  if (!q) return agents.value ?? [];
  return (agents.value ?? []).filter(a => a.name.toLowerCase().includes(q));
});

const modelsById = computed(
  () => new Map((models.value ?? []).map(m => [m.id, m])),
);

// Resolve the stored model slug to its friendly name + provider logo.
// Falls back to the raw slug while the catalog loads or if it's unlisted.
// OpenRouter names come as "Provider: Model"; the logo already carries
// the provider, so the prefix is stripped to avoid duplicating it.
const getModel = (id: string): ProviderModel => {
  const m = modelsById.value.get(id) ?? { id, name: id, avatar: { icon: 'i-lucide-sparkles' } };
  return { ...m, name: m.name.replace(/^[^:]+:\s*/, '') };
};

// The effective text model a run uses (own pick or platform default),
// resolved to its catalog entry, with the inherited-default flag.
const getTextModel = (stored: string | null): ProviderModel & { isDefault: boolean } => {
  const { id, isDefault } = resolveTextModel(stored);
  return { ...getModel(id), isDefault };
};
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb :items="[{ label: $t('__labelAgent', 2) }]" />
      </template>
      <DashboardContainer>
        <div class="flex items-center justify-between gap-4">
          <h1 class="text-2xl font-semibold">
            {{ $t('__labelAgent', 2) }} <span class="text-toned font-normal">({{ used }})</span>
          </h1>
          <template v-if="agents?.length">
            <UTooltip
              v-if="atLimit"
              :text="limitMessage"
            >
              <UButton
                icon="i-lucide-plus"
                disabled
              >
                {{ $t('__actionNewAgent') }}
              </UButton>
            </UTooltip>
            <UButton
              v-else
              icon="i-lucide-plus"
              to="/dashboard/agents/new"
            >
              {{ $t('__actionNewAgent') }}
            </UButton>
          </template>
        </div>

        <div class="flex flex-col gap-4">
          <UInput
            v-if="agents?.length"
            v-model.trim="search"
            icon="i-lucide-search"
            :placeholder="$t('__placeholderSearchAgents')"
          >
            <template #trailing>
              <UButton
                v-if="search"
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-x"
                :aria-label="$t('__actionClearSearch')"
                @click="search = ''"
              />
            </template>
          </UInput>

          <DashboardListSkeleton v-if="pending && !agents?.length" />

          <UEmpty
            v-else-if="!agents?.length"
            variant="subtle"
            icon="i-lucide-sparkles"
            :title="$t('__titleAgentsEmpty')"
            :description="$t('__descriptionAgentsEmpty')"
            :actions="atLimit ? [] : [{ label: $t('__actionCreateFirstAgent'), icon: 'i-lucide-plus', to: '/dashboard/agents/new' }]"
          />

          <div
            v-else-if="filteredAgents.length"
            class="space-y-2"
          >
            <NuxtLink
              v-for="agent in filteredAgents"
              :key="agent.id"
              :to="`/dashboard/agents/${agent.id}`"
              class="block"
            >
              <UCard variant="interactive">
                <div class="flex items-center gap-4">
                  <AgentAvatar
                    :src="agent.avatarUrl"
                    :name="agent.name"
                    :seed="agent.id"
                    size="lg"
                  />
                  <div class="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div class="flex items-center gap-2">
                      <p class="font-medium truncate">
                        {{ agent.name }}
                      </p>
                      <UBadge
                        v-if="agent.isDefault"
                        color="neutral"
                        variant="subtle"
                        size="xs"
                      >
                        {{ $t('__labelDefault') }}
                      </UBadge>
                    </div>
                    <div class="flex items-center gap-1.5 text-sm text-toned min-w-0">
                      <UIcon
                        :name="getTextModel(agent.defaultTextModel).avatar.icon"
                        class="size-5 shrink-0"
                      />
                      <span class="truncate">
                        {{ getTextModel(agent.defaultTextModel).name }}
                        <span
                          v-if="getTextModel(agent.defaultTextModel).isDefault"
                          class="text-toned"
                        >{{ $t('__labelDefaultSuffix') }}</span>
                      </span>
                    </div>
                  </div>
                  <I18nT
                    keypath="__hintEditedAt"
                    tag="span"
                    class="text-xs text-toned shrink-0"
                  >
                    <template #time>
                      <TimeAgo :date="agent.updatedAt" />
                    </template>
                  </I18nT>
                </div>
              </UCard>
            </NuxtLink>
          </div>

          <p
            v-else
            class="text-sm text-toned text-center py-8"
          >
            {{ $t('__descriptionNoAgentsMatchSearch', { query: search }) }}
          </p>
        </div>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
