<script setup lang="ts">
import type { AgentCapabilityRow } from '~~/server/utils/capabilities';

const props = defineProps<{
  agentId: string;
}>();

const { data: rows, pending } = useApiFetch<AgentCapabilityRow[]>(
  () => `/api/agents/${props.agentId}/capabilities`,
);

const attached = computed(() => (rows.value ?? []).filter(c => c.attached));

const iconBySlug: Record<string, string> = {
  'time': 'i-lucide-clock',
  'web-search': 'i-lucide-search',
  'web-fetch': 'i-lucide-globe',
  'github': 'i-simple-icons-github',
  'google-calendar': 'i-simple-icons-googlecalendar',
  'notion': 'i-simple-icons-notion',
};
const iconFor = (slug: string) => iconBySlug[slug] ?? 'i-lucide-puzzle';
</script>

<template>
  <UCard>
    <template #header>
      <p class="font-medium">
        Capabilities
      </p>
    </template>

    <div class="flex flex-wrap gap-2 min-h-6">
      <template v-if="pending">
        <USkeleton
          v-for="i in 3"
          :key="i"
          class="h-6 rounded-full"
          :class="['w-20', 'w-24', 'w-16'][i - 1]"
        />
      </template>
      <template v-else-if="attached.length">
        <div
          v-for="cap in attached"
          :key="cap.id"
          class="flex items-center gap-1.5 text-sm bg-muted rounded-full px-3 py-1"
        >
          <UIcon
            :name="iconFor(cap.slug)"
            class="size-3.5 text-toned shrink-0"
          />
          <span>{{ cap.displayName }}</span>
        </div>
      </template>
      <p
        v-else
        class="text-sm text-toned"
      >
        No capabilities enabled.
      </p>
    </div>
  </UCard>
</template>
