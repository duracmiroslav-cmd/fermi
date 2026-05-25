<script setup lang="ts">
import { updateBotInputSchema } from '~~/shared/schemas/bots';

interface BotEditFormValue {
  agentId: string;
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

const { data: agents, pending: agentsPending } = useLazyFetch<AgentOption[]>('/api/agents', {
  headers: useRequestHeaders(['cookie']),
});

// Hide the selected value while items are loading, otherwise the trigger
// flashes the raw UUID before the matching label is resolved.
const displayAgentId = computed<string | undefined>({
  get: () => (agentsPending.value ? undefined : state.agentId),
  set: (v) => { if (v) state.agentId = v; },
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
  emit('submit', { agentId: state.agentId, disabledAt: state.disabledAt });
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
      <div class="flex items-center gap-2">
        <USelectMenu
          v-model="displayAgentId"
          :items="agentItems"
          value-key="value"
          placeholder="Select an agent"
          :loading="agentsPending"
          class="flex-1"
          :ui="{ base: 'font-mono' }"
        />
        <UTooltip text="Open agent">
          <UButton
            v-if="state.agentId"
            :to="`/dashboard/agents/${state.agentId}`"
            icon="i-lucide-external-link"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Open agent"
          />
        </UTooltip>
      </div>
      <template #help>
        The persona that drives this bot's replies. ·
        <NuxtLink
          to="/dashboard/agents/new"
          class="text-toned hover:text-highlighted hover:underline"
        >
          new agent →
        </NuxtLink>
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
