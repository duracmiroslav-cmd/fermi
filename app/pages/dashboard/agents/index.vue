<script setup lang="ts">
definePageMeta({ layout: false });

interface AgentRow {
  id: string;
  name: string;
  systemPrompt: string | null;
  defaultTextModel: string | null;
  avatarUrl: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
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
        <DashboardBreadcrumb :items="[{ label: 'Agents' }]" />
      </template>
      <DashboardContainer>
        <div class="flex items-center justify-between gap-4">
          <h1 class="text-2xl font-semibold">
            Agents <span class="text-toned font-normal">({{ used }})</span>
          </h1>
          <UTooltip
            v-if="atLimit"
            :text="limitMessage"
          >
            <UButton
              icon="i-lucide-plus"
              disabled
            >
              New agent
            </UButton>
          </UTooltip>
          <UButton
            v-else
            icon="i-lucide-plus"
            to="/dashboard/agents/new"
          >
            New agent
          </UButton>
        </div>

        <div class="flex flex-col gap-4">
          <UInput
            v-if="agents?.length"
            v-model.trim="search"
            icon="i-lucide-search"
            placeholder="Search agents..."
          >
            <template #trailing>
              <UButton
                v-if="search"
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-x"
                aria-label="Clear search"
                @click="search = ''"
              />
            </template>
          </UInput>

          <DashboardListSkeleton
            v-if="pending && !agents?.length"
            :rows="3"
          />

          <UEmpty
            v-else-if="!agents?.length"
            variant="subtle"
            icon="i-lucide-sparkles"
            title="No agents yet"
            description="An agent is a persona with a name, a system prompt, and a default model. Attach one to a bot to bring it to life."
            :actions="atLimit ? [] : [{ label: 'Create your first agent', icon: 'i-lucide-plus', to: '/dashboard/agents/new' }]"
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
              <UCard class="hover:bg-elevated transition-colors">
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
                        Default
                      </UBadge>
                    </div>
                    <p class="text-sm text-toned truncate">
                      {{ agent.defaultTextModel || '—' }}
                    </p>
                  </div>
                  <span class="text-sm text-toned shrink-0">
                    <TimeAgo :date="agent.updatedAt" />
                  </span>
                </div>
              </UCard>
            </NuxtLink>
          </div>

          <p
            v-else
            class="text-sm text-toned text-center py-8"
          >
            No agents match "{{ search }}".
          </p>
        </div>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
