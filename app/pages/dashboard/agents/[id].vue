<script setup lang="ts">
interface AgentDetail {
  id: string;
  name: string;
  systemPrompt: string | null;
  defaultModel: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  bot: { id: string; displayName: string | null; platform: string } | null;
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
    <template #title>
      <span class="flex items-baseline gap-3">
        <span class="truncate">{{ agent?.name || 'agent' }}</span>
        <NuxtLink
          v-if="agent?.bot"
          :to="`/dashboard/bots/${agent.bot.id}`"
          class="font-mono text-xs font-normal text-muted hover:text-highlighted transition-colors flex items-center gap-1 shrink-0"
        >
          bound to {{ agent.bot.displayName || agent.bot.id }}
          <span aria-hidden="true">↗</span>
        </NuxtLink>
        <NuxtLink
          v-else
          to="/dashboard/bots"
          class="font-mono text-xs font-normal text-dimmed hover:text-highlighted transition-colors shrink-0"
        >
          not bound · bind →
        </NuxtLink>
      </span>
    </template>
    <div
      v-if="agent"
      class="p-6 sm:p-8 pb-12 max-w-3xl space-y-12"
    >
      <AgentForm
        form-id="agent-form"
        :initial-value="{
          name: agent.name,
          systemPrompt: agent.systemPrompt ?? '',
          defaultModel: agent.defaultModel ?? undefined,
        }"
        @submit="onSubmit"
      />

      <section>
        <h2 class="font-mono text-xs uppercase tracking-wider text-error mb-3">
          danger zone
        </h2>
        <div class="flex items-center justify-between gap-4 p-4 rounded-md border border-error/40">
          <div class="min-w-0">
            <p class="font-medium">
              Delete this agent
            </p>
            <p class="text-sm text-muted mt-1">
              Permanent. Bots bound to it will be unlinked.
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

      <p class="font-mono text-xs text-dimmed">
        id: {{ agent.id }} · created {{ relativeTime(agent.createdAt) }} · updated {{ relativeTime(agent.updatedAt) }}
      </p>

      <DeleteConfirmDialog
        v-model:open="deleteDialogOpen"
        title="Delete agent"
        :item-name="agent.name"
        confirm-label="Delete agent"
        :loading="deleting"
        @confirm="onDelete"
      >
        <p>
          This permanently deletes
          <span class="font-mono text-highlighted">{{ agent.name }}</span>.
          Bots bound to this agent are unlinked but kept.
        </p>
      </DeleteConfirmDialog>
    </div>

    <template
      v-if="agent"
      #footer
    >
      <UButton
        type="submit"
        form="agent-form"
        :loading="saving"
      >
        Save changes
      </UButton>
    </template>
  </NuxtLayout>
</template>
