<script setup lang="ts">
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

const { items: agents, used, atLimit, pending, limitMessage } = useTierLimit<AgentRow>('agents');

const search = ref('');

const filteredAgents = computed(() => {
  const q = search.value.toLowerCase();
  if (!q) return agents.value ?? [];
  return (agents.value ?? []).filter(a => a.name.toLowerCase().includes(q));
});
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
            {{ $t('__labelAgent', 2) }} <span class="text-toned font-normal font-mono">({{ used }})</span>
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
          <USkeleton
            v-else-if="pending"
            class="h-8 w-32 rounded-md bg-muted/60 shrink-0"
          />
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
          <USkeleton
            v-else-if="pending"
            class="h-8 w-full rounded-md bg-muted/40"
          />

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
            <AgentListCard
              v-for="agent in filteredAgents"
              :key="agent.id"
              :agent="agent"
            />
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
