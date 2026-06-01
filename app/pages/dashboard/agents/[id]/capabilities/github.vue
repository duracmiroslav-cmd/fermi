<script setup lang="ts">
import { CAPABILITY_TOOL_GROUPS } from '~~/shared/capabilityTools';

definePageMeta({ layout: false });

// GitHub-specific editor route. The Nuxt router resolves this file before
// `[slug].vue` when the path is `/capabilities/github`, so this body owns
// the resource × (read, write) matrix layout. Keeping it here means the
// generic page never branches on the github slug.
const route = useRoute();
const { t } = useI18n();
const ctx = useAgentCapabilityEditor({
  agentId: () => route.params.id as string,
  slug:    'github',
});

const {
  capability,
  isToolEnabled,
  onToolToggle,
} = ctx;
</script>

<template>
  <AgentCapabilityEditor
    :ctx="ctx"
    :section-label="t('__titleTools')"
  >
    <div
      v-if="capability"
      class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden"
    >
      <div class="hidden sm:flex gap-4 p-4 pb-3 text-xs uppercase tracking-wider text-toned">
        <span class="w-32 shrink-0" />
        <span class="flex-1">{{ $t('__labelRead') }}</span>
        <span class="flex-1">{{ $t('__labelWrite') }}</span>
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
          <span class="sm:hidden text-xs uppercase tracking-wider text-toned">{{ $t('__labelRead') }}</span>
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
          <span class="sm:hidden text-xs uppercase tracking-wider text-toned">{{ $t('__labelWrite') }}</span>
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
  </AgentCapabilityEditor>
</template>
