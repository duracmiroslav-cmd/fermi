<script setup lang="ts">
import type { AgentCapabilityRow } from '~~/server/utils/capabilities';
import { CAPABILITY_TOOL_GROUPS, DEFAULT_TOOL_ALLOWLISTS } from '~~/shared/capabilityTools';

const props = defineProps<{
  agentId: string;
}>();

const notify = useNotify();

const { data: rows, pending } = useApiFetch<AgentCapabilityRow[]>(
  () => `/api/agents/${props.agentId}/capabilities`,
);

const CAP_WIDTHS = ['w-24', 'w-32', 'w-20', 'w-28'];
const CAP_DESC_WIDTHS = ['w-48', 'w-40', 'w-52', 'w-44'];

const hasToolGroups = (slug: string) => !!CAPABILITY_TOOL_GROUPS[slug];

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
  return { text: 'Connect', to: `/dashboard/connections/${capability.slug}` };
};

const pendingIds = ref(new Set<string>());
const expandedCapId = ref<string | null>(null);
const pendingToolSave = ref(new Set<string>());
const localAllowlists = ref<Record<string, string[]>>({});

const getEffectiveAllowlist = (capability: AgentCapabilityRow): Set<string> => {
  const local = localAllowlists.value[capability.id];
  if (local !== undefined) return new Set(local);
  const saved = capability.agentConfig?.toolAllowlist as string[] | undefined;
  return new Set(saved ?? DEFAULT_TOOL_ALLOWLISTS[capability.slug] ?? []);
};

const isToolEnabled = (capability: AgentCapabilityRow, tool: string) =>
  getEffectiveAllowlist(capability).has(tool);

const getToolCount = (capability: AgentCapabilityRow) => getEffectiveAllowlist(capability).size;

const onToggle = async (capability: AgentCapabilityRow, next: boolean) => {
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
const onToggleExpand = (capability: AgentCapabilityRow, open: boolean) => {
  if (open) {
    if (localAllowlists.value[capability.id] === undefined) {
      const saved = capability.agentConfig?.toolAllowlist as string[] | undefined;
      localAllowlists.value[capability.id] = [...(saved ?? DEFAULT_TOOL_ALLOWLISTS[capability.slug] ?? [])];
    }
    expandedCapId.value = capability.id;
  } else if (expandedCapId.value === capability.id) {
    expandedCapId.value = null;
  }
};

const onToggleTool = (capability: AgentCapabilityRow, tool: string, enabled: boolean) => {
  const current = [...getEffectiveAllowlist(capability)];
  if (enabled) {
    if (!current.includes(tool)) current.push(tool);
  } else {
    const idx = current.indexOf(tool);
    if (idx !== -1) current.splice(idx, 1);
  }
  localAllowlists.value[capability.id] = current;
};

const onCancel = (capability: AgentCapabilityRow) => {
  delete localAllowlists.value[capability.id];
  expandedCapId.value = null;
};

const onSaveTools = async (capability: AgentCapabilityRow) => {
  const list = localAllowlists.value[capability.id];
  if (!list || pendingToolSave.value.has(capability.id)) return;
  pendingToolSave.value.add(capability.id);
  try {
    await $fetch(`/api/agents/${props.agentId}/capabilities/${capability.id}`, {
      method: 'PATCH',
      body:   { config: { toolAllowlist: list } },
    });
    capability.agentConfig = { ...capability.agentConfig, toolAllowlist: list };
    delete localAllowlists.value[capability.id];
    notify.success('Tools saved');
    expandedCapId.value = null;
  } catch (e) {
    notify.error('Save failed', e);
  } finally {
    pendingToolSave.value.delete(capability.id);
  }
};
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-4">
      <h2 class="font-semibold">
        Capabilities
      </h2>
      <NuxtLink
        to="/dashboard/connections"
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
    </div>
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <div
        v-if="pending && !rows"
        class="divide-y divide-default overflow-hidden"
        aria-busy="true"
      >
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
            <div class="h-5 flex items-center">
              <USkeleton
                class="h-3 bg-muted/70"
                :class="CAP_DESC_WIDTHS[(i - 1) % CAP_DESC_WIDTHS.length]"
              />
            </div>
          </div>
          <USkeleton class="h-5 w-9 rounded-full shrink-0" />
        </div>
      </div>

      <div
        v-else
        class="divide-y divide-default overflow-hidden"
      >
        <UCollapsible
          v-for="capability in rows ?? []"
          :key="capability.id"
          :open="expandedCapId === capability.id"
          :disabled="!capability.attached || !hasToolGroups(capability.slug)"
          @update:open="(open) => onToggleExpand(capability, open)"
        >
          <div
            class="flex items-center gap-4 p-4"
            :class="capability.attached && hasToolGroups(capability.slug)
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
                v-if="capability.attached && hasToolGroups(capability.slug)"
                :name="expandedCapId === capability.id ? 'i-lucide-chevron-up' : 'i-lucide-sliders-horizontal'"
                class="size-4 text-toned"
              />
              <USwitch
                :model-value="capability.attached"
                :disabled="isLocked(capability) || pendingIds.has(capability.id)"
                @update:model-value="onToggle(capability, $event)"
                @click.stop
              />
            </div>
          </div>

          <template #content>
            <div class="border-t border-default px-4 pb-4 pt-3 bg-muted/50">
            <div class="hidden sm:flex gap-4 pb-2 border-b border-default text-xs uppercase tracking-wider text-toned">
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
                    @update:model-value="onToggleTool(capability, tool, $event)"
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
                    @update:model-value="onToggleTool(capability, tool, $event)"
                  />
                  <span class="font-mono text-xs text-toned group-hover/tool:text-highlighted transition-colors truncate">
                    {{ tool }}
                  </span>
                </label>
                <span
                  v-if="!group.write.length"
                  class="text-xs text-toned/60"
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
                  :loading="pendingToolSave.has(capability.id)"
                  @click="onSaveTools(capability)"
                >
                  Save
                </UButton>
              </div>
            </div>
            </div>
          </template>
        </UCollapsible>
      </div>
    </UCard>
  </div>
</template>
