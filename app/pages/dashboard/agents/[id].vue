<script setup lang="ts">
definePageMeta({ layout: false });

interface AgentDetail {
  id: string;
  name: string;
  systemPrompt: string | null;
  defaultModel: string | null;
  avatarUrl: string | null;
  isDefault: boolean;
  bots: Array<{ id: string; displayName: string | null; platform: string }>;
  createdAt: string;
  updatedAt: string;
}

const route = useRoute();
const toast = useToast();

const { data: agent, error, pending } = useLazyFetch<AgentDetail>(
  () => `/api/agents/${route.params.id}`,
  { headers: useRequestHeaders(['cookie']) },
);

const saving = ref(false);
const deleting = ref(false);
const deleteDialogOpen = ref(false);

const onSubmit = async (value: { name: string; systemPrompt: string; defaultModel: string }) => {
  saving.value = true;
  try {
    await $fetch(`/api/agents/${route.params.id}`, {
      method: 'PATCH',
      body: {
        name: value.name,
        systemPrompt: value.systemPrompt || null,
        defaultModel: value.defaultModel || null,
      },
    });
    toast.add({ title: 'Agent updated', color: 'success' });
    await navigateTo('/dashboard/agents');
  } catch (e) {
    toast.add({
      title: 'Update failed',
      description: extractErrorMessage(e),
      color: 'error',
    });
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
    toast.add({ title: url ? 'Avatar updated' : 'Avatar removed', color: 'success' });
  } catch (e) {
    toast.add({
      title: 'Avatar update failed',
      description: extractErrorMessage(e),
      color: 'error',
    });
  }
};

const onDelete = async () => {
  deleting.value = true;
  try {
    await $fetch(`/api/agents/${route.params.id}`, { method: 'DELETE' });
    toast.add({ title: 'Agent deleted', color: 'success' });
    await navigateTo('/dashboard/agents');
  } catch (e) {
    toast.add({
      title: 'Delete failed',
      description: extractErrorMessage(e),
      color: 'error',
    });
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

      <div
        v-else-if="error"
        class="p-6 sm:p-8 max-w-3xl"
      >
        <div class="border border-dashed border-default rounded-md py-16 px-6 text-center">
          <p class="text-sm text-muted mb-2">
            Agent not found
          </p>
          <p class="text-sm text-dimmed mb-6 max-w-md mx-auto">
            This agent may have been deleted, or the link is wrong.
          </p>
          <UButton
            to="/dashboard/agents"
            icon="i-lucide-arrow-left"
          >
            Back to agents
          </UButton>
        </div>
      </div>

      <div
        v-if="agent"
        class="p-6 sm:p-8 pb-12 max-w-3xl flex flex-col gap-6"
      >
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
            defaultModel: agent.defaultModel ?? undefined,
          }"
          @submit="onSubmit"
        />

        <UFormField label="Details">
          <div class="p-4 rounded-md border border-muted bg-elevated/40">
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt class="text-muted text-right">
                ID
              </dt>
              <dd class="text-highlighted break-all">
                {{ agent.id }}
              </dd>
              <dt class="text-muted text-right">
                Created
              </dt>
              <dd class="text-highlighted">
                <TimeAgo :date="agent.createdAt" />
              </dd>
              <dt class="text-muted text-right">
                Updated
              </dt>
              <dd class="text-highlighted">
                <TimeAgo :date="agent.updatedAt" />
              </dd>
            </dl>
          </div>
        </UFormField>

        <section>
          <h2 class="text-sm font-medium text-error mb-3">
            Danger zone
          </h2>
          <div class="flex items-center justify-between gap-4 p-4 rounded-md border border-error/40">
            <div class="min-w-0">
              <p class="text-sm font-medium">
                Delete this agent
              </p>
              <p class="text-sm text-muted mt-1">
                <template v-if="agent.isDefault">
                  The default agent can't be deleted. Edit its name or persona instead.
                </template>
                <template v-else-if="agent.bots.length">
                  Rebind {{ agent.bots.length }} bot{{ agent.bots.length === 1 ? '' : 's' }} to another agent first.
                </template>
                <template v-else>
                  Permanent. This agent isn't bound to any bot.
                </template>
              </p>
            </div>
            <UTooltip
              v-if="agent.isDefault || agent.bots.length"
              :text="agent.isDefault ? 'Default agent is undeletable' : 'Agent still bound to a bot'"
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
      </div>
    </NuxtLayout>
  </div>
</template>
