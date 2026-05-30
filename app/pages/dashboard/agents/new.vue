<script setup lang="ts">
import type { TtsModel, TtsVoice } from '~~/shared/tts';

definePageMeta({ layout: false });

const notify = useNotify();
const saving = ref(false);

const onSubmit = async (value: {
  name:               string;
  systemPrompt:       string;
  defaultTextModel:   string | null;
  defaultVisionModel: string | null;
  defaultTtsModel:    TtsModel | null;
  defaultTtsVoice:    TtsVoice | null;
  ttsInstructions:    string;
}) => {
  saving.value = true;
  try {
    const created = await $fetch<{ id: string }>('/api/agents', {
      method: 'POST',
      body:   {
        name:               value.name,
        systemPrompt:       value.systemPrompt || null,
        defaultTextModel:   value.defaultTextModel,
        defaultVisionModel: value.defaultVisionModel,
        defaultTtsModel:    value.defaultTtsModel,
        defaultTtsVoice:    value.defaultTtsVoice,
        ttsInstructions:    value.ttsInstructions || null,
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

      <DashboardContainer>
        <h1 class="text-2xl font-semibold">
          New agent
        </h1>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <p class="font-medium">
                Settings
              </p>
              <div class="flex items-center gap-2">
                <UButton
                  to="/dashboard/agents"
                  color="neutral"
                  variant="ghost"
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
                  Create
                </UButton>
              </div>
            </div>
          </template>
          <AgentForm
            form-id="agent-form"
            @submit="onSubmit"
          />
        </UCard>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
