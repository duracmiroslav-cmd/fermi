<script setup lang="ts">
definePageMeta({ layout: false });

// Generic capability editor route. Handles the two declarative body shapes:
// server-supplied `toolGroups` (twinkle-hub) and the `settings` form
// (image-gen). Capabilities with custom rendering (github's read/write
// matrix) take a sibling route file (e.g. `github.vue`) so this file stays
// free of slug-specific branches.
const route = useRoute();
const ctx = useAgentCapabilityEditor({
  agentId: () => route.params.id as string,
  slug:    () => route.params.slug as string,
});

const {
  capability,
  effectiveSettings,
  isToolEnabled,
  onToolToggle,
  onGroupSelectAll,
  onGroupClearAll,
  onSettingChange,
  getGroupCounts,
  stripToolPrefix,
} = ctx;

const hasGroupedTools = (cap: NonNullable<typeof capability['value']>) => !!cap.toolGroups;
const hasSettings = (cap: NonNullable<typeof capability['value']>) => !!cap.settings?.length;

// Null when the capability has neither tool selection nor settings —
// editor then skips the section entirely instead of rendering an empty
// "Tools" header (web-fetch / web-search / time).
const sectionLabel = computed((): string | null => {
  const cap = capability.value;
  if (!cap) return null;
  if (hasSettings(cap)) return 'Settings';
  if (hasGroupedTools(cap)) return 'Tools';
  return null;
});
</script>

<template>
  <AgentCapabilityEditor
    :ctx="ctx"
    :section-label="sectionLabel"
  >
    <template v-if="capability && hasGroupedTools(capability)">
      <div class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden">
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
                class="text-xs text-toned hover:text-highlighted transition-colors cursor-pointer"
                @click="onGroupSelectAll(group.tools)"
              >
                Select all
              </button>
              <button
                v-else
                type="button"
                class="text-xs text-toned hover:text-highlighted transition-colors cursor-pointer"
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
    </template>

    <template v-else-if="capability && hasSettings(capability)">
      <div class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden">
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
    </template>
  </AgentCapabilityEditor>
</template>
