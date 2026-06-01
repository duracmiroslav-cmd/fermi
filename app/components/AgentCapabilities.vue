<script setup lang="ts">
import type { AgentCapabilityRow, CapabilitySettingField } from '~~/server/utils/capabilities';
import { CAPABILITY_TOOL_GROUPS, DEFAULT_TOOLS } from '~~/shared/capabilityTools';

const props = defineProps<{
  agentId: string;
}>();

const notify = useNotify();

const { data: rows, pending, refresh: refreshCapabilities } = useApiFetch<AgentCapabilityRow[]>(
  () => `/api/agents/${props.agentId}/capabilities`,
);

const CAP_WIDTHS = ['w-24', 'w-32', 'w-20', 'w-28'];
const CAP_DESC_WIDTHS = ['w-48', 'w-40', 'w-52', 'w-44'];

// Three mutually exclusive config-panel modes: per-tool checkbox grid
// (github), per-group toggle list (twinkle-hub), or a settings form
// (image-gen). `hasConfigPanel` opens the collapsible for any; the body
// picks which to render via `hasGroupToggles` / `hasSettings`.
const hasConfigPanel = (capability: AgentCapabilityRow) =>
  !!CAPABILITY_TOOL_GROUPS[capability.slug]
  || !!capability.toolGroups
  || !!capability.settings?.length;

const hasGroupToggles = (capability: AgentCapabilityRow) => !!capability.toolGroups;

const hasSettings = (capability: AgentCapabilityRow) => !!capability.settings?.length;

const isLocked = (capability: AgentCapabilityRow): boolean => {
  if (capability.attached) return false;
  if (capability.credentialType === 'coming_soon') return true;
  if (capability.credentialType === 'providers') {
    return !capability.providers?.some(p => p.status === 'connected');
  }
  return false;
};

const getLockedHint = (capability: AgentCapabilityRow): { text: string; to?: string } | null => {
  if (!isLocked(capability)) return null;
  if (capability.credentialType === 'coming_soon') {
    return { text: 'Coming soon' };
  }
  return { text: 'Connect', to: `/dashboard/connectors/${capability.slug}` };
};

const pendingIds = ref(new Set<string>());
const expandedCapId = ref<string | null>(null);
const pendingConfigSave = ref(new Set<string>());
const localTools = ref<Record<string, string[]>>({});
const localGroups = ref<Record<string, string[]>>({});
const localSettings = ref<Record<string, Record<string, number>>>({});
const isRefreshing = ref(false);

const getEffectiveTools = (capability: AgentCapabilityRow): Set<string> => {
  const local = localTools.value[capability.id];
  if (local !== undefined) return new Set(local);
  const saved = capability.agentConfig?.tools as string[] | undefined;
  return new Set(saved ?? DEFAULT_TOOLS[capability.slug] ?? []);
};

const isToolEnabled = (capability: AgentCapabilityRow, tool: string) =>
  getEffectiveTools(capability).has(tool);

const getToolCount = (capability: AgentCapabilityRow) => getEffectiveTools(capability).size;

const getEffectiveGroups = (capability: AgentCapabilityRow): Set<string> => {
  const local = localGroups.value[capability.id];
  if (local !== undefined) return new Set(local);
  const saved = capability.agentConfig?.enabledGroups as string[] | undefined;
  return new Set(saved ?? capability.defaultEnabledGroups ?? []);
};

const isGroupEnabled = (capability: AgentCapabilityRow, groupSlug: string) =>
  getEffectiveGroups(capability).has(groupSlug);

const getEnabledToolCount = (capability: AgentCapabilityRow): number => {
  const enabled = getEffectiveGroups(capability);
  let total = 0;
  for (const [slug, group] of Object.entries(capability.toolGroups ?? {})) {
    if (enabled.has(slug)) total += group.toolCount;
  }
  return total;
};

// Local edit wins; else the saved per-agent value; else the field default.
const getSettingValue = (capability: AgentCapabilityRow, field: CapabilitySettingField): number => {
  const local = localSettings.value[capability.id]?.[field.key];
  if (local !== undefined) return local;
  const saved = capability.agentConfig?.[field.key];
  return typeof saved === 'number' ? saved : field.default;
};

const onCapabilityToggle = async (capability: AgentCapabilityRow, next: boolean) => {
  if (pendingIds.value.has(capability.id)) return;
  if (!next && expandedCapId.value === capability.id) expandedCapId.value = null;
  const original = capability.attached;
  capability.attached = next;
  pendingIds.value.add(capability.id);
  try {
    if (next) {
      await $fetch(`/api/agents/${props.agentId}/capabilities`, {
        method: 'POST',
        body:   { capabilityId: capability.id },
      });
      notify.success(`${capability.displayName} attached`);
    } else {
      await $fetch(`/api/agents/${props.agentId}/capabilities/${capability.id}`, {
        method: 'DELETE',
      });
      notify.success(`${capability.displayName} detached`);
    }
  } catch (e) {
    capability.attached = original;
    notify.error(next ? 'Attach failed' : 'Detach failed', e);
  } finally {
    pendingIds.value.delete(capability.id);
  }
};

// UCollapsible only emits update:open when its trigger is clicked (not on
// external prop changes), so the close branch only fires for this row's
// own collapse — single-open behavior is coordinated via expandedCapId.
// Gating here instead of via UCollapsible's :disabled avoids a reactivity
// quirk where toggling attached false→true left the trigger inert.
const onExpandToggle = (capability: AgentCapabilityRow, open: boolean) => {
  if (!capability.attached || !hasConfigPanel(capability)) return;
  if (open) {
    if (hasGroupToggles(capability)) {
      if (localGroups.value[capability.id] === undefined) {
        const saved = capability.agentConfig?.enabledGroups as string[] | undefined;
        localGroups.value[capability.id] = [...(saved ?? capability.defaultEnabledGroups ?? [])];
      }
    } else if (hasSettings(capability)) {
      if (localSettings.value[capability.id] === undefined) {
        localSettings.value[capability.id] = Object.fromEntries(
          (capability.settings ?? []).map(f => [f.key, getSettingValue(capability, f)]),
        );
      }
    } else if (localTools.value[capability.id] === undefined) {
      const saved = capability.agentConfig?.tools as string[] | undefined;
      localTools.value[capability.id] = [...(saved ?? DEFAULT_TOOLS[capability.slug] ?? [])];
    }
    expandedCapId.value = capability.id;
  } else if (expandedCapId.value === capability.id) {
    expandedCapId.value = null;
  }
};

const onToolToggle = (capability: AgentCapabilityRow, tool: string, enabled: boolean | 'indeterminate') => {
  if (enabled === 'indeterminate') return;
  const current = [...getEffectiveTools(capability)];
  if (enabled) {
    if (!current.includes(tool)) current.push(tool);
  } else {
    const idx = current.indexOf(tool);
    if (idx !== -1) current.splice(idx, 1);
  }
  localTools.value[capability.id] = current;
};

const onGroupToggle = (capability: AgentCapabilityRow, groupSlug: string, enabled: boolean | 'indeterminate') => {
  if (enabled === 'indeterminate') return;
  const current = [...getEffectiveGroups(capability)];
  if (enabled) {
    if (!current.includes(groupSlug)) current.push(groupSlug);
  } else {
    const idx = current.indexOf(groupSlug);
    if (idx !== -1) current.splice(idx, 1);
  }
  localGroups.value[capability.id] = current;
};

const setSetting = (capability: AgentCapabilityRow, key: string, value: number) => {
  localSettings.value[capability.id] = {
    ...localSettings.value[capability.id],
    [key]: value,
  };
};

const onCancel = (capability: AgentCapabilityRow) => {
  delete localTools.value[capability.id];
  delete localGroups.value[capability.id];
  delete localSettings.value[capability.id];
  expandedCapId.value = null;
};

const onSave = async (capability: AgentCapabilityRow) => {
  if (pendingConfigSave.value.has(capability.id)) return;
  let config: Record<string, unknown>;
  if (hasSettings(capability)) {
    config = { ...localSettings.value[capability.id] };
  } else if (hasGroupToggles(capability)) {
    config = { enabledGroups: localGroups.value[capability.id] };
    if (!config.enabledGroups) return;
  } else {
    config = { tools: localTools.value[capability.id] };
    if (!config.tools) return;
  }
  pendingConfigSave.value.add(capability.id);
  try {
    await $fetch(`/api/agents/${props.agentId}/capabilities/${capability.id}`, {
      method: 'PATCH',
      body:   { config },
    });
    capability.agentConfig = { ...capability.agentConfig, ...config };
    delete localTools.value[capability.id];
    delete localGroups.value[capability.id];
    delete localSettings.value[capability.id];
    notify.success('Saved');
    expandedCapId.value = null;
  } catch (e) {
    notify.error('Save failed', e);
  } finally {
    pendingConfigSave.value.delete(capability.id);
  }
};

// Credentials or providers can flip on Connectors in another tab;
// refresh re-pulls the capability rows so locked/connected state matches.
const onRefresh = async () => {
  isRefreshing.value = true;
  try {
    await refreshCapabilities();
  } finally {
    isRefreshing.value = false;
  }
};
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-4">
      <h2 class="font-semibold">
        Capabilities
      </h2>
      <div class="flex items-center gap-3">
        <NuxtLink
          to="/dashboard/connectors"
          target="_blank"
          rel="noopener"
          class="text-xs text-toned hover:text-highlighted inline-flex items-center gap-1"
        >
          Manage credentials
          <UIcon
            name="i-lucide-external-link"
            class="size-3"
          />
        </NuxtLink>
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="xs"
          label="Refresh"
          :loading="isRefreshing"
          @click="onRefresh"
        />
      </div>
    </div>
    <div
      class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden"
      :aria-busy="pending && !rows ? 'true' : undefined"
    >
      <template v-if="pending && !rows">
        <div
          v-for="i in 4"
          :key="i"
          class="flex items-center gap-4 p-4"
        >
          <USkeleton class="size-5 shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="h-5 flex items-center">
              <USkeleton
                class="h-3"
                :class="CAP_WIDTHS[(i - 1) % CAP_WIDTHS.length]"
              />
            </div>
            <div class="h-4 flex items-center">
              <USkeleton
                class="h-2.5 bg-muted/70"
                :class="CAP_DESC_WIDTHS[(i - 1) % CAP_DESC_WIDTHS.length]"
              />
            </div>
          </div>
          <USkeleton class="h-5 w-9 rounded-full shrink-0" />
        </div>
      </template>

      <template v-else>
        <UCollapsible
          v-for="capability in rows ?? []"
          :key="capability.id"
          :open="expandedCapId === capability.id"
          :unmount-on-hide="false"
          @update:open="(open) => onExpandToggle(capability, open)"
        >
          <div
            class="flex items-center gap-4 p-4"
            :class="capability.attached && hasConfigPanel(capability)
              ? 'cursor-pointer hover:bg-muted transition-colors'
              : ''"
          >
            <UIcon
              :name="getCapabilityIcon(capability.slug)"
              class="size-5 text-toned shrink-0"
            />

            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">
                {{ capability.displayName }}
              </p>
              <p
                v-if="capability.description"
                class="text-xs text-toned"
              >
                {{ capability.description }}
              </p>
            </div>

            <div class="flex items-center gap-3 shrink-0">
              <UBadge
                v-if="capability.credentialType === 'coming_soon'"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                Coming soon
              </UBadge>
              <NuxtLink
                v-if="getLockedHint(capability)?.to"
                :to="getLockedHint(capability)!.to"
                target="_blank"
                rel="noopener"
                class="text-xs text-toned hover:text-highlighted hidden sm:inline-flex items-center gap-1"
                @click.stop
              >
                {{ getLockedHint(capability)!.text }}
                <UIcon
                  name="i-lucide-external-link"
                  class="size-3"
                />
              </NuxtLink>
              <UIcon
                v-if="capability.attached && hasConfigPanel(capability)"
                :name="expandedCapId === capability.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                class="size-4 text-toned"
              />
              <USwitch
                :model-value="capability.attached"
                :disabled="isLocked(capability) || pendingIds.has(capability.id)"
                @update:model-value="onCapabilityToggle(capability, $event)"
                @click.stop
              />
            </div>
          </div>

          <template #content>
            <div class="border-t border-default p-4">
              <template v-if="hasGroupToggles(capability)">
                <label
                  v-for="(group, groupSlug, gi) in capability.toolGroups"
                  :key="groupSlug"
                  class="flex items-center gap-3 py-3 cursor-pointer group/group"
                  :class="gi > 0 ? 'border-t border-default' : ''"
                >
                  <UCheckbox
                    :model-value="isGroupEnabled(capability, groupSlug)"
                    @update:model-value="onGroupToggle(capability, groupSlug, $event)"
                  />
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium group-hover/group:text-highlighted transition-colors">
                      {{ group.label }}
                    </p>
                  </div>
                  <span class="text-xs text-toned shrink-0">
                    {{ group.toolCount }} tools
                  </span>
                </label>

                <div class="flex items-center justify-between mt-4 pt-3 border-t border-default">
                  <p class="text-xs text-toned">
                    {{ getEnabledToolCount(capability) }} tools enabled
                  </p>
                  <div class="flex items-center gap-2">
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      @click="onCancel(capability)"
                    >
                      Cancel
                    </UButton>
                    <UButton
                      size="xs"
                      :loading="pendingConfigSave.has(capability.id)"
                      @click="onSave(capability)"
                    >
                      Save
                    </UButton>
                  </div>
                </div>
              </template>

              <template v-else-if="hasSettings(capability)">
                <div
                  v-for="(field, fi) in capability.settings"
                  :key="field.key"
                  class="flex flex-col gap-2"
                  :class="fi > 0 ? 'mt-4 pt-4 border-t border-default' : ''"
                >
                  <p class="text-sm font-medium">
                    {{ field.label }}
                  </p>
                  <USlider
                    :model-value="getSettingValue(capability, field)"
                    :min="field.min"
                    :max="field.max"
                    :step="1"
                    @update:model-value="setSetting(capability, field.key, ($event as number))"
                  />
                  <div class="flex items-center justify-between text-xs text-toned">
                    <span>{{ field.minLabel }}</span>
                    <span>{{ field.maxLabel }}</span>
                  </div>
                </div>

                <div class="flex items-center justify-end mt-4 pt-3 border-t border-default">
                  <div class="flex items-center gap-2">
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      @click="onCancel(capability)"
                    >
                      Cancel
                    </UButton>
                    <UButton
                      size="xs"
                      :loading="pendingConfigSave.has(capability.id)"
                      @click="onSave(capability)"
                    >
                      Save
                    </UButton>
                  </div>
                </div>
              </template>

              <template v-else>
                <div class="hidden sm:flex gap-4 pb-3 border-b border-default text-xs uppercase tracking-wider text-toned">
                  <span class="w-32 shrink-0" />
                  <span class="flex-1">Read</span>
                  <span class="flex-1">Write</span>
                </div>

                <div
                  v-for="(group, gi) in CAPABILITY_TOOL_GROUPS[capability.slug]"
                  :key="group.resource"
                  class="flex flex-col sm:flex-row gap-2 sm:gap-4 py-3"
                  :class="gi > 0 ? 'border-t border-default' : ''"
                >
                  <p class="sm:w-32 sm:shrink-0 text-sm font-medium">
                    {{ group.resource }}
                  </p>
                  <div class="flex-1 flex flex-col gap-1">
                    <span class="sm:hidden text-xs uppercase tracking-wider text-toned">
                      Read
                    </span>
                    <label
                      v-for="tool in group.read"
                      :key="tool"
                      class="flex items-center gap-2 py-0.5 cursor-pointer group/tool"
                    >
                      <UCheckbox
                        :model-value="isToolEnabled(capability, tool)"
                        @update:model-value="onToolToggle(capability, tool, $event)"
                      />
                      <span class="font-mono text-xs text-toned group-hover/tool:text-highlighted transition-colors truncate">
                        {{ tool }}
                      </span>
                    </label>
                  </div>
                  <div class="flex-1 flex flex-col gap-1">
                    <span class="sm:hidden text-xs uppercase tracking-wider text-toned">
                      Write
                    </span>
                    <label
                      v-for="tool in group.write"
                      :key="tool"
                      class="flex items-center gap-2 py-0.5 cursor-pointer group/tool"
                    >
                      <UCheckbox
                        :model-value="isToolEnabled(capability, tool)"
                        @update:model-value="onToolToggle(capability, tool, $event)"
                      />
                      <span class="font-mono text-xs text-toned group-hover/tool:text-highlighted transition-colors truncate">
                        {{ tool }}
                      </span>
                    </label>
                    <span
                      v-if="!group.write.length"
                      class="text-xs text-muted"
                    >
                      —
                    </span>
                  </div>
                </div>

                <div class="flex items-center justify-between mt-4 pt-3 border-t border-default">
                  <p class="text-xs text-toned">
                    {{ getToolCount(capability) }} tools enabled
                  </p>
                  <div class="flex items-center gap-2">
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      @click="onCancel(capability)"
                    >
                      Cancel
                    </UButton>
                    <UButton
                      size="xs"
                      :loading="pendingConfigSave.has(capability.id)"
                      @click="onSave(capability)"
                    >
                      Save
                    </UButton>
                  </div>
                </div>
              </template>
            </div>
          </template>
        </UCollapsible>
      </template>
    </div>
  </div>
</template>
