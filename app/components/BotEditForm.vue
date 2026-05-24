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
    class="space-y-8"
    @submit="onSubmit"
  >
    <section>
      <h2 class="font-mono text-xs uppercase tracking-wider text-dimmed mb-4">
        agent
      </h2>
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
          class="w-full"
          :ui="{ base: 'font-mono' }"
        />
        <template #help>
          Drives this bot's replies. Clear to pause.
        </template>
      </UFormField>
    </section>

    <section>
      <h2 class="font-mono text-xs uppercase tracking-wider text-dimmed mb-4">
        status
      </h2>
      <USwitch
        v-model="enabled"
        label="Enabled"
        description="When off, fermi receives webhook events but does not reply."
      />
    </section>
  </UForm>
</template>
