<script setup lang="ts">
import type { AgentCapabilityRow } from '~~/server/utils/capabilities';

const props = defineProps<{
  agentId: string;
}>();

const { data: rows, pending, refresh } = useApiFetch<AgentCapabilityRow[]>(
  () => `/api/agents/${props.agentId}/capabilities`,
);

const attached = computed(() => (rows.value ?? []).filter(c => c.attached));

// The agent detail page refetches this after the builder changes
// capabilities; its page-level refresh only covers the agent, not this fetch.
defineExpose({ refresh });
</script>

<template>
  <div class="flex flex-col gap-3">
    <h2 class="font-semibold flex items-center gap-2">
      <UIcon
        name="i-lucide-blocks"
        class="size-4 text-toned"
      />
      {{ $t('__titleCapabilities') }}
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
        <div
          v-else
          class="w-full flex flex-col items-start gap-3"
        >
          <p class="text-sm text-toned">
            {{ $t('__titleNoCapabilitiesEnabled') }}
          </p>
          <UButton
            :to="`/dashboard/agents/${agentId}/edit`"
            icon="i-lucide-plus"
            color="primary"
            variant="soft"
            size="sm"
          >
            {{ $t('__actionAddCapability') }}
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>
