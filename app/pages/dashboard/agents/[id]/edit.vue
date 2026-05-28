<script setup lang="ts">
definePageMeta({ layout: false });

interface AgentDetail {
  id:                 string;
  name:               string;
  systemPrompt:       string | null;
  defaultTextModel:   string | null;
  defaultVisionModel: string | null;
  avatarUrl:          string | null;
  isDefault:          boolean;
  bots:               Array<{ id: string; displayName: string | null; platform: string }>;
}

const route = useRoute();
const notify = useNotify();

const { data: agent, error, pending } = useApiFetch<AgentDetail>(
  () => `/api/agents/${route.params.id}`,
);

const saving = ref(false);
const deleting = ref(false);
const deleteDialogOpen = ref(false);

const onSubmit = async (value: { name: string; systemPrompt: string; defaultTextModel: string; defaultVisionModel: string }) => {
  saving.value = true;
  try {
    await $fetch(`/api/agents/${route.params.id}`, {
      method: 'PATCH',
      body:   {
        name:               value.name,
        systemPrompt:       value.systemPrompt || null,
        defaultTextModel:   value.defaultTextModel || null,
        defaultVisionModel: value.defaultVisionModel || null,
      },
    });
    notify.success('Agent updated');
    await refreshNuxtData(route.params.id as string);
    await navigateTo(`/dashboard/agents/${route.params.id}`);
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
      body:   { avatarUrl: url },
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
            { label: agent?.name ?? '', to: `/dashboard/agents/${route.params.id}` },
            { label: 'Edit' },
          ]"
          :loading="!agent"
        />
      </template>

      <DashboardDetailSkeleton v-if="pending && !agent" />

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
          <div class="size-12 shrink-0">
            <AgentAvatarUpload
              :agent-id="agent.id"
              :current-url="agent.avatarUrl"
              @change="onAvatarChange"
            />
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
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-semibold">
              Settings
            </h2>
            <div class="flex items-center gap-2">
              <UButton
                :to="`/dashboard/agents/${agent.id}`"
                color="neutral"
                variant="outline"
                size="sm"
              >
                Cancel
              </UButton>
              <UButton
                type="submit"
                form="agent-form"
                :loading="saving"
                size="sm"
              >
                Save
              </UButton>
            </div>
          </div>
          <UCard>
            <AgentForm
              form-id="agent-form"
              :initial-value="{
                name: agent.name,
                systemPrompt: agent.systemPrompt ?? '',
                defaultTextModel: agent.defaultTextModel ?? undefined,
                defaultVisionModel: agent.defaultVisionModel ?? undefined,
              }"
              @submit="onSubmit"
            />
          </UCard>
        </div>

        <AgentCapabilities :agent-id="agent.id" />

        <div
          v-if="!agent.isDefault"
          class="flex flex-col gap-3"
        >
          <h2 class="font-semibold text-error">
            Danger zone
          </h2>
          <UCard>
            <div class="grid grid-cols-12 gap-4 md:items-center">
              <div class="col-span-12 md:col-span-9 min-w-0">
                <p class="text-sm font-medium">
                  Delete this agent
                </p>
                <p class="text-xs text-toned mt-1">
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
                    size="sm"
                    disabled
                  >
                    Delete agent
                  </UButton>
                </UTooltip>
                <UButton
                  v-else
                  color="error"
                  variant="outline"
                  size="sm"
                  @click="deleteDialogOpen = true"
                >
                  Delete agent
                </UButton>
              </div>
            </div>
          </UCard>
        </div>

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
