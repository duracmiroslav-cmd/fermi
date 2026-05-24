<script setup lang="ts">
interface AgentRow {
  id: string;
  name: string;
  systemPrompt: string | null;
  defaultModel: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

const { items: agents, limit, used, atLimit } = useTierLimit<AgentRow>('agents');

const initial = (name: string) => name.charAt(0).toUpperCase() || '?';
</script>

<template>
  <NuxtLayout name="dashboard">
    <template #title>
      agents
    </template>
    <template #actions>
      <UTooltip
        v-if="atLimit"
        :text="`Free tier limit (${used}/${limit}) · upgrade`"
      >
        <UButton
          icon="i-lucide-plus"
          size="sm"
          disabled
        >
          new agent
        </UButton>
      </UTooltip>
      <UButton
        v-else
        icon="i-lucide-plus"
        size="sm"
        to="/dashboard/agents/new"
      >
        new agent
      </UButton>
    </template>

    <div class="p-6 sm:p-8">
      <p class="font-mono text-xs text-dimmed mb-6">
        {{ used }} / {{ limit }} agents
      </p>

      <div
        v-if="!agents?.length"
        class="border border-dashed border-default rounded-md py-16 px-6 text-center"
      >
        <p class="font-mono text-sm text-muted mb-2">
          no agents yet
        </p>
        <p class="text-sm text-dimmed mb-6 max-w-md mx-auto">
          An agent is a persona — a name, a system prompt, and a default model. Attach one to a bot to bring it to life.
        </p>
        <UButton
          v-if="!atLimit"
          to="/dashboard/agents/new"
          icon="i-lucide-plus"
        >
          create your first agent
        </UButton>
      </div>

      <div
        v-else
        class="space-y-2 max-w-3xl"
      >
        <NuxtLink
          v-for="agent in agents"
          :key="agent.id"
          :to="`/dashboard/agents/${agent.id}`"
          class="group flex items-center gap-4 p-4 rounded-md border border-default hover:bg-muted/30 transition-colors"
        >
          <UAvatar
            :text="initial(agent.name)"
            size="sm"
          />
          <div class="flex-1 min-w-0">
            <p class="font-medium truncate">
              {{ agent.name }}
            </p>
            <p class="font-mono text-xs text-dimmed truncate mt-0.5">
              {{ agent.defaultModel || '—' }}
            </p>
          </div>
          <span class="font-mono text-xs text-dimmed shrink-0">
            {{ relativeTime(agent.updatedAt) }}
          </span>
        </NuxtLink>
      </div>
    </div>
  </NuxtLayout>
</template>
