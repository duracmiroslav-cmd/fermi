<script setup lang="ts">
definePageMeta({ layout: false });

interface AgentRow {
  id: string;
  name: string;
  systemPrompt: string | null;
  defaultModel: string | null;
  avatarUrl: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const { items: agents, used, atLimit, pending, limitMessage } = useTierLimit<AgentRow>('agents');

const initial = (name: string) => name.charAt(0).toUpperCase() || '?';

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
      <template #actions>
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
      </template>

      <DashboardContainer>
        <h1 class="text-2xl font-semibold">
          Agents <span class="text-toned font-normal">({{ used }})</span>
        </h1>

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

          <div
            v-else-if="!agents?.length"
            class="border border-dashed border-default rounded-md py-16 px-6 text-center"
          >
            <p class="font-semibold mb-2">
              No agents yet
            </p>
            <p class="text-sm text-toned mb-6 max-w-md mx-auto">
              An agent is a persona with a name, a system prompt, and a default model. Attach one to a bot to bring it to life.
            </p>
            <UButton
              v-if="!atLimit"
              to="/dashboard/agents/new"
              icon="i-lucide-plus"
            >
              Create your first agent
            </UButton>
          </div>

          <div
            v-else-if="filteredAgents.length"
            class="space-y-2"
          >
            <NuxtLink
              v-for="agent in filteredAgents"
              :key="agent.id"
              :to="`/dashboard/agents/${agent.id}`"
              class="group flex items-center gap-4 p-4 rounded-md border border-muted bg-elevated/50 hover:bg-elevated transition-colors"
            >
              <UAvatar
                :src="agent.avatarUrl ?? undefined"
                :text="initial(agent.name)"
                size="lg"
                color="primary"
              />
              <div class="flex-1 min-w-0">
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
                <p class="text-sm text-toned truncate mt-0.5">
                  {{ agent.defaultModel || '—' }}
                </p>
              </div>
              <span class="text-sm text-toned shrink-0">
                <TimeAgo :date="agent.updatedAt" />
              </span>
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
