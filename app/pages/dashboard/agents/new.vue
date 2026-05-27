<script setup lang="ts">
definePageMeta({ layout: false });

const notify = useNotify();
const saving = ref(false);

const onSubmit = async (value: { name: string; systemPrompt: string; defaultTextModel: string }) => {
  saving.value = true;
  try {
    const created = await $fetch<{ id: string }>('/api/agents', {
      method: 'POST',
      body:   {
        name:             value.name,
        systemPrompt:     value.systemPrompt || null,
        defaultTextModel: value.defaultTextModel || null,
      },
    });
    notify.success('Agent created');
    await navigateTo(`/dashboard/agents/${created.id}`);
  } catch (e) {
    notify.error('Create failed', e);
  } finally {
    saving.value = false;
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

      <DashboardContainer>
        <AgentForm
          form-id="agent-form"
          @submit="onSubmit"
        />
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
