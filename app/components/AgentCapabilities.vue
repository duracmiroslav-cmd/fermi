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

const isLocked = (cap: AgentCapabilityRow): boolean => {
  if (cap.attached) return false;
  if (cap.credentialType === 'coming_soon') return true;
  if (cap.credentialType === 'providers') {
    return !cap.providers?.some(p => p.status === 'connected');
  }
  return false;
};

const getLockedHint = (cap: AgentCapabilityRow): { text: string; to?: string } | null => {
  if (!isLocked(cap)) return null;
  if (cap.credentialType === 'coming_soon') {
    return { text: 'Coming soon' };
  }
  return { text: 'Connect', to: `/dashboard/connections/${cap.slug}` };
};

const pendingIds = ref(new Set<string>());
const expandedCapId = ref<string | null>(null);
const pendingToolSave = ref(new Set<string>());
const localAllowlists = ref<Record<string, string[]>>({});

const getEffectiveAllowlist = (cap: AgentCapabilityRow): Set<string> => {
  const local = localAllowlists.value[cap.id];
  if (local !== undefined) return new Set(local);
  const saved = cap.agentConfig?.toolAllowlist as string[] | undefined;
  return new Set(saved ?? DEFAULT_TOOL_ALLOWLISTS[cap.slug] ?? []);
};

const isToolEnabled = (cap: AgentCapabilityRow, tool: string) =>
  getEffectiveAllowlist(cap).has(tool);

const hasWriteEnabled = (cap: AgentCapabilityRow): boolean => {
  const groups = CAPABILITY_TOOL_GROUPS[cap.slug];
  if (!groups) return false;
  const allowlist = getEffectiveAllowlist(cap);
  return groups
    .filter(g => g.label.startsWith('Write'))
    .some(g => g.tools.some(t => allowlist.has(t)));
};

const getToolCount = (cap: AgentCapabilityRow) => getEffectiveAllowlist(cap).size;

const onToggle = async (cap: AgentCapabilityRow, next: boolean) => {
  if (pendingIds.value.has(cap.id)) return;
  if (!next && expandedCapId.value === cap.id) expandedCapId.value = null;
  const original = cap.attached;
  cap.attached = next;
  pendingIds.value.add(cap.id);
  try {
    if (next) {
      await $fetch(`/api/agents/${props.agentId}/capabilities`, {
        method: 'POST',
        body:   { capabilityId: cap.id },
      });
      notify.success(`${cap.displayName} attached`);
    } else {
      await $fetch(`/api/agents/${props.agentId}/capabilities/${cap.id}`, {
        method: 'DELETE',
      });
      notify.success(`${cap.displayName} detached`);
    }
  } catch (e) {
    cap.attached = original;
    notify.error(next ? 'Attach failed' : 'Detach failed', e);
  } finally {
    pendingIds.value.delete(cap.id);
  }
};

const onToggleExpand = (cap: AgentCapabilityRow) => {
  if (expandedCapId.value === cap.id) {
    expandedCapId.value = null;
    return;
  }
  if (localAllowlists.value[cap.id] === undefined) {
    const saved = cap.agentConfig?.toolAllowlist as string[] | undefined;
    localAllowlists.value[cap.id] = [...(saved ?? DEFAULT_TOOL_ALLOWLISTS[cap.slug] ?? [])];
  }
  expandedCapId.value = cap.id;
};

const onToggleTool = (cap: AgentCapabilityRow, tool: string, enabled: boolean) => {
  const current = [...getEffectiveAllowlist(cap)];
  if (enabled) {
    if (!current.includes(tool)) current.push(tool);
  } else {
    const idx = current.indexOf(tool);
    if (idx !== -1) current.splice(idx, 1);
  }
  localAllowlists.value[cap.id] = current;
};

const onSaveTools = async (cap: AgentCapabilityRow) => {
  const list = localAllowlists.value[cap.id];
  if (!list || pendingToolSave.value.has(cap.id)) return;
  pendingToolSave.value.add(cap.id);
  try {
    await $fetch(`/api/agents/${props.agentId}/capabilities/${cap.id}`, {
      method: 'PATCH',
      body:   { config: { toolAllowlist: list } },
    });
    cap.agentConfig = { ...cap.agentConfig, toolAllowlist: list };
    delete localAllowlists.value[cap.id];
    notify.success('Tools saved');
    expandedCapId.value = null;
  } catch (e) {
    notify.error('Save failed', e);
  } finally {
    pendingToolSave.value.delete(cap.id);
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
        <div
          v-for="cap in rows ?? []"
          :key="cap.id"
        >
          <div class="flex items-center gap-4 p-4">
            <UIcon
              :name="getCapabilityIcon(cap.slug)"
              class="size-5 text-toned shrink-0"
            />

            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">
                {{ cap.displayName }}
              </p>
              <p
                v-if="cap.description"
                class="text-xs text-toned"
              >
                {{ cap.description }}
              </p>
            </div>

            <div class="flex items-center gap-3 shrink-0">
              <UBadge
                v-if="cap.credentialType === 'coming_soon'"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                Coming soon
              </UBadge>
              <NuxtLink
                v-if="getLockedHint(cap)?.to"
                :to="getLockedHint(cap)!.to"
                target="_blank"
                rel="noopener"
                class="text-xs text-toned hover:text-highlighted hidden sm:inline-flex items-center gap-1"
              >
                {{ getLockedHint(cap)!.text }}
                <UIcon
                  name="i-lucide-external-link"
                  class="size-3"
                />
              </NuxtLink>
              <UButton
                v-if="cap.attached && hasToolGroups(cap.slug)"
                size="xs"
                color="neutral"
                variant="ghost"
                :icon="expandedCapId === cap.id ? 'i-lucide-chevron-up' : 'i-lucide-sliders-horizontal'"
                :class="{ 'text-primary': hasWriteEnabled(cap) }"
                @click="onToggleExpand(cap)"
              />
              <USwitch
                :model-value="cap.attached"
                :disabled="isLocked(cap) || pendingIds.has(cap.id)"
                @update:model-value="onToggle(cap, $event)"
              />
            </div>
          </div>

          <div
            v-if="expandedCapId === cap.id && cap.attached"
            class="border-t border-default px-4 pb-4 pt-3 bg-muted/50"
          >
            <div
              v-for="(group, gi) in CAPABILITY_TOOL_GROUPS[cap.slug]"
              :key="group.label"
              :class="gi > 0 ? 'mt-4' : ''"
            >
              <p class="text-xs text-toned font-medium mb-2">
                {{ group.label }}
              </p>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-y-1 gap-x-2">
                <label
                  v-for="tool in group.tools"
                  :key="tool"
                  class="flex items-center gap-2 py-0.5 cursor-pointer group/tool"
                >
                  <UCheckbox
                    :model-value="isToolEnabled(cap, tool)"
                    @update:model-value="onToggleTool(cap, tool, $event)"
                  />
                  <span class="font-mono text-xs text-toned group-hover/tool:text-highlighted transition-colors truncate">
                    {{ tool }}
                  </span>
                </label>
              </div>
            </div>

            <div class="flex items-center justify-between mt-4 pt-3 border-t border-default">
              <p class="text-xs text-toned">
                {{ getToolCount(cap) }} tools enabled
              </p>
              <div class="flex items-center gap-2">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="expandedCapId = null"
                >
                  Cancel
                </UButton>
                <UButton
                  size="xs"
                  :loading="pendingToolSave.has(cap.id)"
                  @click="onSaveTools(cap)"
                >
                  Save
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
