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
  'time':            'i-lucide-clock',
  'web-search':      'i-lucide-search',
  'web-fetch':       'i-lucide-globe',
  'github':          'i-simple-icons-github',
  'google-calendar': 'i-simple-icons-googlecalendar',
  'notion':          'i-simple-icons-notion',
};
const iconFor = (slug: string) => iconBySlug[slug] ?? 'i-lucide-puzzle';
</script>

<template>
  <div class="flex flex-col gap-3">
    <h2 class="font-semibold">
      Capabilities
    </h2>
    <UCard>
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
          <UBadge
            v-for="cap in attached"
            :key="cap.id"
            color="neutral"
            variant="soft"
            size="md"
            :icon="iconFor(cap.slug)"
            class="bg-accented"
          >
            {{ cap.displayName }}
          </UBadge>
        </template>
        <p
          v-else
          class="text-sm text-toned"
        >
          No capabilities enabled.
        </p>
      </div>
    </UCard>
  </div>
</template>
