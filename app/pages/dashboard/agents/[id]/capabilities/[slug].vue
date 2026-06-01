<script setup lang="ts">
import type { AgentCapabilityRow } from '~~/server/utils/capabilities';
import { CAPABILITY_TOOL_GROUPS, DEFAULT_TOOLS } from '~~/shared/capabilityTools';

definePageMeta({ layout: false });

const route = useRoute();
const notify = useNotify();

interface AgentSummary {
  id:   string;
  name: string;
}

const agentId = computed(() => route.params.id as string);
const slug = computed(() => route.params.slug as string);

const { data: agent, pending: agentPending } = useApiFetch<AgentSummary>(
  () => `/api/agents/${agentId.value}`,
);

const {
  data: rows,
  pending: rowsPending,
  refresh: refreshRows,
} = useApiFetch<AgentCapabilityRow[]>(
  () => `/api/agents/${agentId.value}/capabilities`,
);

const pending = computed(() => agentPending.value || rowsPending.value);

const capability = computed(() => (rows.value ?? []).find(c => c.slug === slug.value) ?? null);

const isLocked = computed((): boolean => {
  const cap = capability.value;
  if (!cap || cap.attached) return false;
  if (cap.credentialType === 'coming_soon') return true;
  if (cap.credentialType === 'providers') {
    return !cap.providers?.some(p => p.status === 'connected');
  }
  return false;
});

const lockedHint = computed((): { text: string; to: string } | null => {
  const cap = capability.value;
  if (!cap || !isLocked.value) return null;
  if (cap.credentialType === 'coming_soon') return null;
  return { text: 'Connect a credential', to: `/dashboard/connectors/${cap.slug}` };
});

const hasGroupedTools = (cap: AgentCapabilityRow) => !!cap.toolGroups;
const hasGithubMatrix = (cap: AgentCapabilityRow) => !!CAPABILITY_TOOL_GROUPS[cap.slug];
const hasSettings = (cap: AgentCapabilityRow) => !!cap.settings?.length;

const stripToolPrefix = (tool: string) => tool.replace(/^twtools-|^opendata-/, '');

// Catalog default mirrors the dispatcher's runtime fallback: union of tools
// belonging to `defaultEnabledGroups` for grouped capabilities, else the
// github-style read-only baseline. Used both to pre-check on first open and
// as the target of the "Reset to default" action.
const getDefaultTools = (cap: AgentCapabilityRow): string[] => {
  if (cap.toolGroups && cap.defaultEnabledGroups) {
    return cap.defaultEnabledGroups.flatMap(g => cap.toolGroups?.[g]?.tools ?? []);
  }
  return [...(DEFAULT_TOOLS[cap.slug] ?? [])];
};

const localTools = ref<string[] | null>(null);
const localSettings = ref<Record<string, number> | null>(null);

const savedTools = computed((): string[] => {
  const cap = capability.value;
  if (!cap) return [];
  const saved = cap.agentConfig?.tools as string[] | undefined;
  return saved ?? getDefaultTools(cap);
});

const effectiveTools = computed((): Set<string> => new Set(localTools.value ?? savedTools.value));

const savedSettings = computed((): Record<string, number> => {
  const cap = capability.value;
  if (!cap?.settings) return {};
  return Object.fromEntries(
    cap.settings.map((f) => {
      const v = cap.agentConfig?.[f.key];
      return [f.key, typeof v === 'number' ? v : f.default];
    }),
  );
});

const effectiveSettings = computed((): Record<string, number> => localSettings.value ?? savedSettings.value);

const isToolEnabled = (tool: string) => effectiveTools.value.has(tool);

// Comparing sorted arrays so order changes don't read as dirty — the
// dispatcher treats both as sets and only the membership matters.
const sortedKey = (xs: string[]) => [...new Set(xs)].sort().join('');

const isDirty = computed((): boolean => {
  const cap = capability.value;
  if (!cap) return false;
  if (hasSettings(cap)) {
    return localSettings.value !== null
      && Object.keys(savedSettings.value).some(
        k => effectiveSettings.value[k] !== savedSettings.value[k],
      );
  }
  if (localTools.value === null) return false;
  return sortedKey(localTools.value) !== sortedKey(savedTools.value);
});

const onToolToggle = (tool: string, enabled: boolean | 'indeterminate') => {
  if (enabled === 'indeterminate') return;
  const current = [...effectiveTools.value];
  if (enabled) {
    if (!current.includes(tool)) current.push(tool);
  } else {
    const idx = current.indexOf(tool);
    if (idx !== -1) current.splice(idx, 1);
  }
  localTools.value = current;
};

const onGroupSelectAll = (groupTools: string[]) => {
  const current = new Set(effectiveTools.value);
  for (const t of groupTools) current.add(t);
  localTools.value = [...current];
};

const onGroupClearAll = (groupTools: string[]) => {
  const current = new Set(effectiveTools.value);
  for (const t of groupTools) current.delete(t);
  localTools.value = [...current];
};

const onDiscard = () => {
  localTools.value = null;
  localSettings.value = null;
};

const onSettingChange = (key: string, value: number) => {
  localSettings.value = { ...effectiveSettings.value, [key]: value };
};

const attaching = ref(false);

const onAttachToggle = async (next: boolean) => {
  const cap = capability.value;
  if (!cap || attaching.value) return;
  attaching.value = true;
  try {
    if (next) {
      await $fetch(`/api/agents/${agentId.value}/capabilities`, {
        method: 'POST',
        body:   { capabilityId: cap.id },
      });
      notify.success(`${cap.displayName} attached`);
    } else {
      await $fetch(`/api/agents/${agentId.value}/capabilities/${cap.id}`, { method: 'DELETE' });
      notify.success(`${cap.displayName} detached`);
    }
    await refreshRows();
  } catch (e) {
    notify.error(next ? 'Attach failed' : 'Detach failed', e);
  } finally {
    attaching.value = false;
  }
};

const saving = ref(false);

const onSave = async () => {
  const cap = capability.value;
  if (!cap || saving.value) return;
  let config: Record<string, unknown>;
  if (hasSettings(cap)) {
    config = effectiveSettings.value;
  } else {
    config = { tools: [...effectiveTools.value] };
  }
  saving.value = true;
  try {
    await $fetch(`/api/agents/${agentId.value}/capabilities/${cap.id}`, {
      method: 'PATCH',
      body:   { config },
    });
    notify.success('Saved');
    // Refresh first so the saved `agentConfig` matches the user's local edit
    // before we drop the local override — otherwise the slider / checkboxes
    // briefly snap to the pre-edit saved state during the gap.
    await refreshRows();
    onDiscard();
  } catch (e) {
    notify.error('Save failed', e);
  } finally {
    saving.value = false;
  }
};

// Per-group counts power both the "N/M" label and the select-all/clear-all
// affordance — clicking the link does whichever flips the larger half.
const getGroupCounts = (groupTools: string[]) => {
  let on = 0;
  for (const t of groupTools) if (effectiveTools.value.has(t)) on++;
  return { on, total: groupTools.length };
};

const breadcrumbItems = computed(() => [
  { label: 'Agents', to: '/dashboard/agents' },
  { label: agent.value?.name ?? '', to: `/dashboard/agents/${agentId.value}/edit` },
  { label: capability.value?.displayName ?? '' },
]);

// Single line of header status, mirroring the connectors detail page's
// "Connected / Available" headline. For attached capabilities with a tool
// selection, appends the count so the user sees the scope without scrolling.
const statusHeadline = computed((): string => {
  const cap = capability.value;
  if (!cap) return '';
  if (cap.credentialType === 'coming_soon') return 'Coming soon';
  if (cap.attached) {
    if (hasGroupedTools(cap) || hasGithubMatrix(cap)) {
      return `Attached · ${effectiveTools.value.size} of ${getDefaultTools(cap).length} default tools selected`;
    }
    return 'Attached';
  }
  return 'Not attached';
});
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb
          :items="breadcrumbItems"
          :loading="!capability"
        />
      </template>

      <DashboardDetailSkeleton v-if="pending && !capability" />

      <DashboardContainer v-else-if="capability">
        <header class="flex items-center gap-4">
          <div class="size-12 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <UIcon
              :name="getCapabilityIcon(capability.slug)"
              class="size-6 text-primary"
            />
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-semibold truncate">
              {{ capability.displayName }}
            </h1>
            <p class="text-sm text-toned mt-1">
              {{ statusHeadline }}
            </p>
          </div>
          <USwitch
            :model-value="capability.attached"
            :disabled="isLocked || attaching || capability.credentialType === 'coming_soon'"
            @update:model-value="onAttachToggle"
          />
        </header>

        <p
          v-if="capability.description"
          class="text-sm text-default"
        >
          {{ capability.description }}
        </p>

        <UAlert
          v-if="lockedHint"
          icon="i-lucide-lock"
          color="warning"
          variant="subtle"
          title="A credential is required"
          :description="`Connect a provider on the Connectors page, then come back here to attach this capability to ${agent?.name ?? 'this agent'}.`"
          :actions="[{ label: lockedHint.text, to: lockedHint.to, color: 'warning', variant: 'soft', size: 'md' }]"
        />

        <!-- Tool / settings block. One wrapping section so the Cancel/Save bar
             mirrors agent edit's "Settings" pattern — h2 left, actions right,
             no sticky footer. Body branches by capability shape underneath. -->
        <section
          v-if="hasGroupedTools(capability) || hasGithubMatrix(capability) || hasSettings(capability)"
          class="flex flex-col gap-3"
        >
          <div class="flex items-center justify-between gap-4">
            <h2 class="font-semibold">
              {{ hasSettings(capability) ? 'Settings' : 'Tools' }}
            </h2>
            <div class="flex items-center gap-2">
              <UButton
                :to="`/dashboard/agents/${agentId}/edit`"
                color="neutral"
                variant="outline"
                size="sm"
              >
                Cancel
              </UButton>
              <UButton
                size="sm"
                :loading="saving"
                :disabled="!isDirty || !capability.attached"
                @click="onSave"
              >
                Save
              </UButton>
            </div>
          </div>

          <div :class="capability.attached ? '' : 'opacity-50 pointer-events-none'">
            <!-- Twinkle Hub: per-tool checkboxes grouped under each group's label. -->
            <div
              v-if="hasGroupedTools(capability)"
              class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden"
            >
              <div
                v-for="(group, groupSlug) in capability.toolGroups"
                :key="groupSlug"
                class="flex flex-col gap-3 p-4"
              >
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-medium">
                    {{ group.label }}
                  </p>
                  <div class="flex items-center gap-3 shrink-0">
                    <span class="text-xs text-toned font-mono">
                      {{ getGroupCounts(group.tools).on }}/{{ getGroupCounts(group.tools).total }}
                    </span>
                    <button
                      v-if="getGroupCounts(group.tools).on < group.tools.length"
                      type="button"
                      class="text-xs text-toned hover:text-highlighted transition-colors"
                      @click="onGroupSelectAll(group.tools)"
                    >
                      Select all
                    </button>
                    <button
                      v-else
                      type="button"
                      class="text-xs text-toned hover:text-highlighted transition-colors"
                      @click="onGroupClearAll(group.tools)"
                    >
                      Clear all
                    </button>
                  </div>
                </div>
                <div class="flex flex-col gap-1">
                  <label
                    v-for="tool in group.tools"
                    :key="tool"
                    class="flex items-center gap-2 py-0.5 cursor-pointer group/tool"
                  >
                    <UCheckbox
                      :model-value="isToolEnabled(tool)"
                      @update:model-value="onToolToggle(tool, $event)"
                    />
                    <span class="font-mono text-xs text-toned group-hover/tool:text-highlighted transition-colors truncate">
                      {{ stripToolPrefix(tool) }}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <!-- GitHub: resource × (read, write) matrix, write side stays visible
                 so the read-only safety boundary is legible at a glance. -->
            <div
              v-else-if="hasGithubMatrix(capability)"
              class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden"
            >
              <div class="hidden sm:flex gap-4 p-4 pb-3 text-xs uppercase tracking-wider text-toned">
                <span class="w-32 shrink-0" />
                <span class="flex-1">Read</span>
                <span class="flex-1">Write</span>
              </div>

              <div
                v-for="group in CAPABILITY_TOOL_GROUPS[capability.slug]"
                :key="group.resource"
                class="flex flex-col sm:flex-row gap-2 sm:gap-4 p-4"
              >
                <p class="sm:w-32 sm:shrink-0 text-sm font-medium">
                  {{ group.resource }}
                </p>
                <div class="flex-1 flex flex-col gap-1">
                  <span class="sm:hidden text-xs uppercase tracking-wider text-toned">Read</span>
                  <label
                    v-for="tool in group.read"
                    :key="tool"
                    class="flex items-center gap-2 py-0.5 cursor-pointer group/tool"
                  >
                    <UCheckbox
                      :model-value="isToolEnabled(tool)"
                      @update:model-value="onToolToggle(tool, $event)"
                    />
                    <span class="font-mono text-xs text-toned group-hover/tool:text-highlighted transition-colors truncate">
                      {{ tool }}
                    </span>
                  </label>
                </div>
                <div class="flex-1 flex flex-col gap-1">
                  <span class="sm:hidden text-xs uppercase tracking-wider text-toned">Write</span>
                  <label
                    v-for="tool in group.write"
                    :key="tool"
                    class="flex items-center gap-2 py-0.5 cursor-pointer group/tool"
                  >
                    <UCheckbox
                      :model-value="isToolEnabled(tool)"
                      @update:model-value="onToolToggle(tool, $event)"
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
            </div>

            <!-- image-gen and future single-control capabilities. -->
            <div
              v-else-if="hasSettings(capability)"
              class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden"
            >
              <div
                v-for="field in (capability.settings ?? [])"
                :key="field.key"
                class="flex flex-col gap-3 p-4"
              >
                <p class="text-sm font-medium">
                  {{ field.label }}
                </p>
                <USlider
                  :model-value="effectiveSettings[field.key] ?? field.default"
                  :min="field.min"
                  :max="field.max"
                  :step="1"
                  @update:model-value="(v: number | undefined) => onSettingChange(field.key, v ?? field.default)"
                />
                <div class="flex items-center justify-between text-xs text-toned">
                  <span>{{ field.minLabel }}</span>
                  <span>{{ field.maxLabel }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </DashboardContainer>

      <DashboardContainer v-else>
        <UEmpty
          variant="subtle"
          icon="i-lucide-search-x"
          title="Capability not found"
          description="This capability does not exist for this agent, or the link is wrong."
          :actions="[{ label: 'Back to agent', icon: 'i-lucide-arrow-left', to: `/dashboard/agents/${agentId}` }]"
        />
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
