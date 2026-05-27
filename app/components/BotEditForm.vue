<script setup lang="ts">
import { updateBotInputSchema } from '~~/shared/schemas/bots';

interface BotEditFormValue {
  agentId: string;
  disabledAt: string | null;
}

interface AgentOption {
  id: string;
  name: string;
  avatarUrl: string | null;
  defaultTextModel: string | null;
  isDefault: boolean;
}

const props = defineProps<{
  formId: string;
  initialValue: BotEditFormValue;
}>();

const emit = defineEmits<{
  submit: [value: BotEditFormValue];
}>();

const { data: agents, pending: agentsPending } = useApiFetch<AgentOption[]>('/api/agents');

const state = reactive<BotEditFormValue>({
  agentId: props.initialValue.agentId,
  disabledAt: props.initialValue.disabledAt,
});

const isAgentPickerOpening = ref(false);

// Hide the selected value while items are loading, otherwise the trigger
// flashes the raw UUID before the matching label is resolved.
const displayAgentId = computed<string | undefined>({
  get: () => (agentsPending.value ? undefined : state.agentId),
  set: (v) => { if (v) state.agentId = v; },
});

const agentItems = computed(() =>
  (agents.value ?? []).map(a => ({
    label: a.name,
    value: a.id,
    description: a.defaultTextModel ?? ', ',
    avatar: {
      src: a.avatarUrl ?? undefined,
      text: a.name.charAt(0).toUpperCase(),
      color: 'primary' as const,
    },
    isDefault: a.isDefault,
  })),
);

const selectedAgent = computed(() =>
  (agents.value ?? []).find(a => a.id === state.agentId) ?? null,
);

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
      <USelectMenu
        v-model="displayAgentId"
        :items="agentItems"
        value-key="value"
        placeholder="Select an agent"
        :loading="agentsPending || isAgentPickerOpening"
        :ui="{ base: 'ps-10!', itemLeadingAvatarSize: 'lg' }"
        @pointerdown="isAgentPickerOpening = true"
        @update:open="isAgentPickerOpening = false"
      >
        <template #leading>
          <UIcon
            v-if="isAgentPickerOpening"
            name="i-lucide-loader-circle"
            class="size-5 animate-spin text-toned"
          />
          <UAvatar
            v-else-if="selectedAgent"
            :src="selectedAgent.avatarUrl ?? undefined"
            :text="selectedAgent.name.charAt(0).toUpperCase()"
            size="xs"
            color="primary"
          />
        </template>
        <template #item-label="{ item }">
          <span class="inline-flex items-center gap-1.5 truncate">
            {{ item.label }}
            <UBadge
              v-if="item.isDefault"
              color="neutral"
              variant="subtle"
              size="xs"
            >
              Default
            </UBadge>
          </span>
        </template>
        <template #item-trailing="{ item }">
          <UTooltip text="View agent">
            <UButton
              :to="`/dashboard/agents/${item.value}`"
              target="_blank"
              rel="noopener"
              icon="i-lucide-external-link"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="View agent"
              class="hover:bg-accented! group-data-[state=checked]:hover:bg-primary/20!"
              @click.stop
              @pointerdown.stop
            />
          </UTooltip>
          <div
            v-if="state.agentId !== item.value"
            class="size-5 shrink-0"
            aria-hidden="true"
          />
        </template>
      </USelectMenu>

      <template #help>
        <div class="flex items-center justify-between gap-4">
          <span>The persona that drives this bot's replies.</span>
          <NuxtLink
            to="/dashboard/agents/new"
            class="shrink-0 text-primary hover:underline inline-flex items-center gap-1"
          >
            <UIcon
              name="i-lucide-plus"
              class="size-3.5"
            />
            New agent
          </NuxtLink>
        </div>
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
