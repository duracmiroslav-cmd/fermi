<script setup lang="ts">
import { updateBotInputSchema } from '~~/shared/schemas/bots';

interface BotEditFormValue {
  agentId: string | null;
  disabledAt: string | null;
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

const agentItems = computed(() =>
  (agents.value ?? []).map(a => ({ label: a.name, value: a.id })),
);

const state = reactive<BotEditFormValue>({
  agentId: props.initialValue.agentId,
  disabledAt: props.initialValue.disabledAt,
});

// Bridges the boolean switch UX with the `disabled_at` timestamp DB
// shape. Off → store the moment the user disabled it; on → clear.
const enabled = computed({
  get: () => state.disabledAt === null,
  set: (next) => { state.disabledAt = next ? null : new Date().toISOString(); },
});

const onSubmit = () => {
  emit('submit', {
    agentId: state.agentId ?? null,
    disabledAt: state.disabledAt,
  });
};
</script>

<template>
  <UForm
    :id="formId"
    :schema="updateBotInputSchema"
    :state="state"
    class="flex flex-col gap-6"
    @submit="onSubmit"
  >
    <UFormField
      label="Agent"
      name="agentId"
    >
      <USelectMenu
        v-model="state.agentId"
        :items="agentItems"
        value-key="value"
        clear
        placeholder="Select an agent"
        :ui="{ base: 'font-mono' }"
      />
      <template #help>
        Pick the agent that replies. Leave empty to keep the bot quiet.
      </template>
    </UFormField>

    <UFormField
      label="Enabled"
      help="When off, the bot won't reply."
    >
      <USwitch v-model="enabled" />
    </UFormField>
  </UForm>
</template>
