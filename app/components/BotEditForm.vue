<script setup lang="ts">
import { updateBotInputSchema } from '~~/shared/schemas/bots';

interface BotEditFormValue {
  displayName: string;
  agentId: string | null;
  enabled: boolean;
  allowGroups: boolean;
}

interface AgentOption {
  id: string;
  name: string;
}

const props = defineProps<{
  formId: string;
  initialValue: BotEditFormValue;
}>();

const emit = defineEmits<{
  submit: [value: BotEditFormValue];
}>();

const { data: agents } = await useFetch<AgentOption[]>('/api/agents', {
  headers: useRequestHeaders(['cookie']),
});

const agentItems = computed(() => [
  { label: '(no agent)', value: null },
  ...(agents.value ?? []).map(a => ({ label: a.name, value: a.id })),
]);

const state = reactive<BotEditFormValue>({
  displayName: props.initialValue.displayName,
  agentId: props.initialValue.agentId,
  enabled: props.initialValue.enabled,
  allowGroups: props.initialValue.allowGroups,
});

const onSubmit = () => {
  emit('submit', { ...state });
};
</script>

<template>
  <UForm
    :id="formId"
    :schema="updateBotInputSchema"
    :state="state"
    class="space-y-8"
    @submit="onSubmit"
  >
    <section>
      <h2 class="font-mono text-xs uppercase tracking-wider text-dimmed mb-4">
        identity
      </h2>
      <UFormField
        label="Display name"
        name="displayName"
      >
        <UInput
          v-model="state.displayName"
          placeholder="fermi-prod-line"
          class="w-full"
        />
        <template #help>
          Only shown in fermi. LINE's bot name is not affected.
        </template>
      </UFormField>
    </section>

    <section>
      <h2 class="font-mono text-xs uppercase tracking-wider text-dimmed mb-4">
        agent
      </h2>
      <UFormField
        label="Use agent"
        name="agentId"
      >
        <USelect
          v-model="state.agentId"
          :items="agentItems"
          class="w-full"
          :ui="{ base: 'font-mono' }"
        />
        <template #help>
          The agent's persona drives this bot's responses. Leave empty to pause replies.
        </template>
      </UFormField>
    </section>

    <section>
      <h2 class="font-mono text-xs uppercase tracking-wider text-dimmed mb-4">
        behavior
      </h2>
      <div class="space-y-4">
        <USwitch
          v-model="state.enabled"
          label="Enabled"
          description="When off, fermi receives webhook events but does not reply."
        />
        <USwitch
          v-model="state.allowGroups"
          label="Allow group chats"
          description="When on, the bot also replies in LINE group conversations."
        />
      </div>
    </section>
  </UForm>
</template>
