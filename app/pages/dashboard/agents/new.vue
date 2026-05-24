<script setup lang="ts">
const toast = useToast();
const saving = ref(false);

const onSubmit = async (value: { name: string; systemPrompt: string; defaultModel: string }) => {
  saving.value = true;
  try {
    const created = await $fetch<{ id: string }>('/api/agents', {
      method: 'POST',
      body: {
        name: value.name,
        systemPrompt: value.systemPrompt || null,
        defaultModel: value.defaultModel || null,
      },
    });
    toast.add({ title: 'Agent created', color: 'success' });
    await navigateTo(`/dashboard/agents/${created.id}`);
  }
  catch (e) {
    toast.add({
      title: 'Create failed',
      description: e instanceof Error ? e.message : 'Unknown error',
      color: 'error',
    });
  }
  finally {
    saving.value = false;
  }
};
</script>

<template>
  <NuxtLayout name="dashboard">
    <template #title>
      <DashboardBreadcrumb
        :items="[
          { label: 'Agents', to: '/dashboard/agents' },
          { label: 'New' },
        ]"
      />
    </template>

    <template #actions>
      <UButton
        type="submit"
        form="agent-form"
        :loading="saving"
      >
        Create
      </UButton>
    </template>

    <div class="p-6 sm:p-8 pb-12 max-w-3xl">
      <AgentForm
        form-id="agent-form"
        @submit="onSubmit"
      />
    </div>
  </NuxtLayout>
</template>
