<script setup lang="ts">
interface AgentDetail {
  id: string;
  name: string;
  systemPrompt: string | null;
  defaultModel: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

const route = useRoute();
const toast = useToast();

const { data: agent, error } = await useFetch<AgentDetail>(
  () => `/api/agents/${route.params.id}`,
  { headers: useRequestHeaders(['cookie']) },
);

if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Agent not found' });
}

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
  }
  catch (e) {
    toast.add({
      title: 'Update failed',
      description: e instanceof Error ? e.message : 'Unknown error',
      color: 'error',
    });
  }
  finally {
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
  }
  catch (e) {
    toast.add({
      title: 'Avatar update failed',
      description: e instanceof Error ? e.message : 'Unknown error',
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
  }
  catch (e) {
    toast.add({
      title: 'Delete failed',
      description: e instanceof Error ? e.message : 'Unknown error',
      color: 'error',
    });
    deleting.value = false;
  }
};
</script>

<template>
  <NuxtLayout name="dashboard">
    <template #title />

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
        <h1 class="text-2xl font-semibold truncate">
          {{ agent.name || '(unnamed)' }}
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
        <div class="p-4 rounded-md border border-default bg-elevated/40">
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs">
            <dt class="text-dimmed text-right">ID</dt>
            <dd class="text-toned break-all">{{ agent.id }}</dd>
            <dt class="text-dimmed text-right">Created</dt>
            <dd class="text-toned"><TimeAgo :date="agent.createdAt" /></dd>
            <dt class="text-dimmed text-right">Updated</dt>
            <dd class="text-toned"><TimeAgo :date="agent.updatedAt" /></dd>
          </dl>
        </div>
      </UFormField>

      <section>
        <h2 class="font-mono text-xs uppercase tracking-wider text-error mb-3">
          danger zone
        </h2>
        <div class="flex items-center justify-between gap-4 p-4 rounded-md border border-error/40">
          <div class="min-w-0">
            <p class="text-sm font-medium">
              Delete this agent
            </p>
            <p class="text-sm text-muted mt-1">
              Permanent. Bots using this agent will stop replying.
            </p>
          </div>
          <UButton
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
</template>
