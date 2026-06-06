<script setup lang="ts">
definePageMeta({ layout: false });

// Generic capability editor route. Handles the two declarative body shapes:
// server-supplied `toolGroups` (twinkle-hub) and the `settings` form
// (image-gen). Capabilities with custom rendering (github's read/write
// matrix) take a sibling route file (e.g. `github.vue`) so this file stays
// free of slug-specific branches.
const route = useRoute();
const { t } = useI18n();
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

// A field with `showWhen` renders only while the named setting holds the given
// value — e.g. a model's own knob appears only when that model is selected.
const visibleSettings = computed(() => (capability.value?.settings ?? []).filter(
  f => !f.showWhen || effectiveSettings.value[f.showWhen.key] === f.showWhen.value,
));

// effectiveSettings values are number | string (slider vs select); read each
// with the type its control expects, falling back to the field default.
const numSetting = (key: string, fallback: number): number => {
  const v = effectiveSettings.value[key];
  return typeof v === 'number' ? v : fallback;
};
const strSetting = (key: string, fallback: string): string => {
  const v = effectiveSettings.value[key];
  return typeof v === 'string' ? v : fallback;
};

// Null when the capability has neither tool selection nor settings —
// editor then skips the section entirely instead of rendering an empty
// "Tools" header (web-fetch / web-search / time).
const sectionLabel = computed((): string | null => {
  const cap = capability.value;
  if (!cap) return null;
  if (hasSettings(cap)) return t('__titleSettings');
  if (hasGroupedTools(cap)) return t('__titleTools');
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
                {{ $t('__actionSelectAll') }}
              </button>
              <button
                v-else
                type="button"
                class="text-xs text-toned hover:text-highlighted transition-colors cursor-pointer"
                @click="onGroupClearAll(group.tools)"
              >
                {{ $t('__actionClearAll') }}
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
          v-for="field in visibleSettings"
          :key="field.key"
          class="flex flex-col gap-3 p-4"
        >
          <p class="text-sm font-medium">
            {{ field.label }}
          </p>
          <template v-if="field.type === 'slider'">
            <USlider
              :model-value="numSetting(field.key, field.default)"
              :min="field.min"
              :max="field.max"
              :step="1"
              @update:model-value="(v: number | undefined) => onSettingChange(field.key, v ?? field.default)"
            />
            <div class="flex items-center justify-between text-xs text-toned">
              <span>{{ field.minLabel }}</span>
              <span>{{ field.maxLabel }}</span>
            </div>
          </template>
          <USelectMenu
            v-else-if="field.type === 'select'"
            :model-value="strSetting(field.key, field.default)"
            :items="field.options"
            value-key="value"
            :ui="{ itemTrailingIcon: 'hidden' }"
            @update:model-value="(v: string) => onSettingChange(field.key, v)"
          />
        </div>
      </div>
    </template>
  </AgentCapabilityEditor>
</template>
