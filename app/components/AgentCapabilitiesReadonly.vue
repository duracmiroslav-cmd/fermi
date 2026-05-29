<script setup lang="ts">
import type { AgentCapabilityRow } from '~~/server/utils/capabilities';

const props = defineProps<{
  agentId: string;
}>();

const { data: rows, pending } = useApiFetch<AgentCapabilityRow[]>(
  () => `/api/agents/${props.agentId}/capabilities`,
);

const attached = computed(() => (rows.value ?? []).filter(c => c.attached));
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
            class="h-6 rounded-md"
            :class="['w-20', 'w-24', 'w-16'][i - 1]"
          />
        </template>
        <template v-else-if="attached.length">
          <UBadge
            v-for="capability in attached"
            :key="capability.id"
            color="neutral"
            variant="soft"
            size="md"
            :icon="getCapabilityIcon(capability.slug)"
            class="bg-accented"
          >
            {{ capability.displayName }}
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
