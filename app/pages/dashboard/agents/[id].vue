<script setup lang="ts">
definePageMeta({ layout: false });

interface AgentDetail {
  id: string;
  name: string;
  systemPrompt: string | null;
  defaultTextModel: string | null;
  avatarUrl: string | null;
  isDefault: boolean;
  bots: Array<{ id: string; displayName: string | null; platform: string }>;
  createdAt: string;
  updatedAt: string;
}

const route = useRoute();
const notify = useNotify();

const { data: agent, error, pending } = useApiFetch<AgentDetail>(
  () => `/api/agents/${route.params.id}`,
);

const saving = ref(false);
const deleting = ref(false);
const deleteDialogOpen = ref(false);

const onSubmit = async (value: { name: string; systemPrompt: string; defaultTextModel: string }) => {
  saving.value = true;
  try {
    await $fetch(`/api/agents/${route.params.id}`, {
      method: 'PATCH',
      body: {
        name: value.name,
        systemPrompt: value.systemPrompt || null,
        defaultTextModel: value.defaultTextModel || null,
      },
    });
    notify.success('Agent updated');
    await navigateTo('/dashboard/agents');
  } catch (e) {
    notify.error('Update failed', e);
  } finally {
    saving.value = false;
  }
};

const onAvatarChange = async (url: string | null) => {
  try {
    await $fetch(`/api/agents/${route.params.id}`, {
      method: 'PATCH',
      body: { avatarUrl: url },
    });
    if (agent.value) agent.value.avatarUrl = url;
    notify.success(url ? 'Avatar updated' : 'Avatar removed');
  } catch (e) {
    notify.error('Avatar update failed', e);
  }
};

const onDelete = async () => {
  deleting.value = true;
  try {
    await $fetch(`/api/agents/${route.params.id}`, { method: 'DELETE' });
    notify.success('Agent deleted');
    await navigateTo('/dashboard/agents');
  } catch (e) {
    notify.error('Delete failed', e);
    deleting.value = false;
  }
};
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

      <template
        v-if="agent"
        #actions
      >
        <UButton
          type="submit"
          form="agent-form"
          :loading="saving"
        >
          Save
        </UButton>
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
          <AgentAvatarUpload
            :agent-id="agent.id"
            :current-url="agent.avatarUrl"
            :fallback="(agent.name ?? '?').charAt(0).toUpperCase()"
            @change="onAvatarChange"
          />
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

        <AgentForm
          form-id="agent-form"
          :initial-value="{
            name: agent.name,
            systemPrompt: agent.systemPrompt ?? '',
            defaultTextModel: agent.defaultTextModel ?? undefined,
          }"
          @submit="onSubmit"
        />

        <AgentCapabilities :agent-id="agent.id" />

        <UFormField label="Details">
          <BaseCard>
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
          </BaseCard>
        </UFormField>

        <section v-if="!agent.isDefault">
          <h2 class="text-sm font-medium text-error mb-3">
            Danger zone
          </h2>
          <div class="grid grid-cols-12 gap-4 md:items-center p-4 rounded-md border border-error/40">
            <div class="col-span-12 md:col-span-9 min-w-0">
              <p class="text-sm font-medium">
                Delete this agent
              </p>
              <p class="text-sm text-toned mt-1">
                <template v-if="agent.bots.length">
                  Bound to {{ agent.bots.length }} bot{{ agent.bots.length === 1 ? '' : 's' }}. Rebind to another agent before deleting.
                </template>
                <template v-else>
                  Permanent. This agent isn't bound to any bot.
                </template>
              </p>
            </div>
            <div class="col-span-12 md:col-span-3 justify-self-end">
              <UTooltip
                v-if="agent.bots.length"
                text="Agent still bound to a bot"
              >
                <UButton
                  color="error"
                  variant="outline"
                  disabled
                >
                  Delete agent
                </UButton>
              </UTooltip>
              <UButton
                v-else
                color="error"
                variant="outline"
                @click="deleteDialogOpen = true"
              >
                Delete agent
              </UButton>
            </div>
          </div>
        </section>

        <DeleteConfirmDialog
          v-model:open="deleteDialogOpen"
          title="Delete agent"
          :item-name="agent.name"
          confirm-label="Delete"
          :loading="deleting"
          @confirm="onDelete"
        >
          <p>
            Permanently deletes
            <span class="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{{ agent.name }}</span>.
            Bots using this agent stop replying.
          </p>
        </DeleteConfirmDialog>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
