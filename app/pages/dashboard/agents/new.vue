<script setup lang="ts">
definePageMeta({ layout: false });

const { t } = useI18n();
const notify = useNotify();
const saving = ref(false);

const onSubmit = async (value: {
  name:             string;
  systemPrompt:     string;
  defaultTextModel: string | null;
}) => {
  saving.value = true;
  try {
    const created = await $fetch<{ id: string }>('/api/agents', {
      method: 'POST',
      body:   {
        name:             value.name,
        systemPrompt:     value.systemPrompt || null,
        defaultTextModel: value.defaultTextModel,
      },
    });
    notify.success(t('__toastAgentCreated'));
    await navigateTo(`/dashboard/agents/${created.id}`);
  } catch (e) {
    notify.error(t('__toastCreateFailed'), e);
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
            { label: $t('__labelAgent', 2), to: '/dashboard/agents' },
            { label: $t('__titleNewAgent') },
          ]"
        />
      </template>

      <DashboardContainer>
        <h1 class="text-2xl font-semibold">
          {{ $t('__titleNewAgent') }}
        </h1>

        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-semibold">
              {{ $t('__titleSettings') }}
            </h2>
            <div class="flex items-center gap-2">
              <UButton
                to="/dashboard/agents"
                color="neutral"
                variant="outline"
                size="sm"
              >
                {{ $t('__actionCancel') }}
              </UButton>
              <UButton
                type="submit"
                form="agent-form"
                :loading="saving"
                size="sm"
              >
                {{ $t('__actionCreate') }}
              </UButton>
            </div>
          </div>

          <UCard>
            <AgentForm
              form-id="agent-form"
              @submit="onSubmit"
            />
          </UCard>
        </div>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
