<script setup lang="ts">
definePageMeta({ layout: false });

interface AgentDetail {
  id: string;
  name: string;
  avatarUrl: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const route = useRoute();

const { data: agent, error, pending } = useApiFetch<AgentDetail>(
  () => `/api/agents/${route.params.id}`,
);
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
          <div class="relative shrink-0">
            <UAvatar
              v-if="agent.avatarUrl"
              :src="agent.avatarUrl"
              size="3xl"
            />
            <div
              v-else
              class="size-12 rounded-full bg-primary/10 flex items-center justify-center"
            >
              <span class="font-mono text-xl font-semibold text-primary">
                {{ (agent.name ?? '?').charAt(0).toUpperCase() }}
              </span>
            </div>
            <span class="absolute bottom-0 right-0 size-3 rounded-full ring-2 ring-default bg-success" />
          </div>
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
            <p class="text-sm text-toned mt-1">
              Ready
            </p>
          </div>
        </div>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <p class="font-medium">
                Details
              </p>
              <UButton
                :to="`/dashboard/agents/${agent.id}/edit`"
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
              >
                Edit
              </UButton>
            </div>
          </template>
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
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
        </UCard>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
