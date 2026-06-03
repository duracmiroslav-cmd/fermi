<script setup lang="ts">
import { resolveTextModel } from '~~/shared/constants/models';
import { updateBotInputSchema } from '~~/shared/schemas/bots';

interface BotEditFormValue {
  agentId:    string;
  disabledAt: string | null;
}

interface AgentOption {
  id:               string;
  name:             string;
  avatarUrl:        string | null;
  defaultTextModel: string | null;
  isDefault:        boolean;
}

const props = defineProps<{
  formId:          string;
  initialValue:    BotEditFormValue;
  isSetupComplete: boolean;
}>();

const emit = defineEmits<{
  submit: [value: BotEditFormValue];
}>();

const { data: agents, pending: agentsPending, refresh: refreshAgents } = useApiFetch<AgentOption[]>('/api/agents');

const state = reactive<BotEditFormValue>({
  agentId:    props.initialValue.agentId,
  disabledAt: props.initialValue.disabledAt,
});

const isAgentPickerOpening = ref(false);
const isRefreshing = ref(false);

// Hide the selected value while items are loading, otherwise the trigger
// flashes the raw UUID before the matching label is resolved.
const displayAgentId = computed<string | undefined>({
  get: () => (agentsPending.value ? undefined : state.agentId),
  set: (v) => { if (v) state.agentId = v; },
});

const agentItems = computed(() =>
  (agents.value ?? []).map((a) => {
    const model = resolveTextModel(a.defaultTextModel);
    return {
      label:       a.name,
      value:       a.id,
      description: model.isDefault ? `${model.id} (default)` : model.id,
      avatarUrl:   a.avatarUrl,
      isDefault:   a.isDefault,
    };
  }),
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

// The agent list can change in another tab (create/rename/delete) while
// this picker is open; refresh re-pulls /api/agents without closing it.
const onRefresh = async () => {
  isRefreshing.value = true;
  try {
    await refreshAgents();
  } finally {
    isRefreshing.value = false;
  }
};

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
      :label="$t('__labelAgent', 1)"
      name="agentId"
    >
      <USelectMenu
        v-model="displayAgentId"
        :items="agentItems"
        value-key="value"
        :placeholder="$t('__placeholderSelectAgent')"
        :loading="agentsPending || isAgentPickerOpening"
        :ui="{ itemTrailingIcon: 'hidden' }"
        @pointerdown="isAgentPickerOpening = true"
        @update:open="isAgentPickerOpening = false"
      >
        <template #content-top>
          <div
            class="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-default"
            @pointerdown.stop
          >
            <span class="text-xs">
              {{ agents?.length ?? 0 }} {{ $t('__labelAgent', agents?.length ?? 0) }}
            </span>
            <div class="flex items-center gap-1">
              <UButton
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                size="xs"
                :label="$t('__actionRefresh')"
                :loading="isRefreshing"
                @click.stop="onRefresh"
                @pointerdown.stop
              />
              <UButton
                to="/dashboard/agents/new"
                target="_blank"
                rel="noopener"
                icon="i-lucide-plus"
                color="neutral"
                variant="ghost"
                size="xs"
                :label="$t('__actionNewAgent')"
                @pointerdown.stop
              />
            </div>
          </div>
        </template>
        <template #leading>
          <UIcon
            v-if="isAgentPickerOpening"
            name="i-lucide-loader-circle"
            class="size-4 animate-spin text-toned"
          />
          <AgentAvatar
            v-else-if="selectedAgent"
            :src="selectedAgent.avatarUrl"
            :name="selectedAgent.name"
            :seed="selectedAgent.id"
            size="3xs"
          />
        </template>
        <template #item-leading="{ item }">
          <AgentAvatar
            :src="item.avatarUrl"
            :name="item.label"
            :seed="item.value"
            size="xs"
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
              {{ $t('__labelDefault') }}
            </UBadge>
          </span>
        </template>
        <template #item-trailing="{ item }">
          <!-- size-7 box aligns the check with the trailing button -->
          <span class="flex items-center justify-center size-7 shrink-0">
            <UIcon
              v-if="state.agentId === item.value"
              name="i-lucide-check"
              class="size-4"
            />
          </span>
          <UTooltip :text="$t('__actionViewAgent')">
            <UButton
              :to="`/dashboard/agents/${item.value}`"
              target="_blank"
              rel="noopener"
              icon="i-lucide-external-link"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="$t('__actionViewAgent')"
              class="hover:bg-accented! group-data-[state=checked]:hover:bg-primary/20!"
              @click.stop
              @pointerdown.stop
            />
          </UTooltip>
        </template>
      </USelectMenu>

      <template #help>
        {{ $t('__hintAgentField') }}
      </template>
    </UFormField>

    <SettingsToggle
      v-if="props.isSetupComplete"
      v-model="enabled"
      :label="$t('__labelEnabled')"
      :description="$t('__hintEnabledBot')"
    />
  </UForm>
</template>
