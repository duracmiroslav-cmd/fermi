<script setup lang="ts">
import type { AgentCapabilityRow } from '~~/server/utils/capabilities';

const props = defineProps<{
  agentId: string;
}>();

const { data: rows, pending, refresh: refreshCapabilities } = useApiFetch<AgentCapabilityRow[]>(
  () => `/api/agents/${props.agentId}/capabilities`,
);

const CAP_WIDTHS = ['w-24', 'w-32', 'w-20', 'w-28'];
const CAP_DESC_WIDTHS = ['w-48', 'w-40', 'w-52', 'w-44'];

// Coming-soon rows render as inert info — there's no detail page worth
// navigating to. Every other capability's row links into its sub-page,
// which owns attach/detach and per-tool config.
const isLinkable = (capability: AgentCapabilityRow) =>
  capability.credentialType !== 'coming_soon';

const NuxtLink = resolveComponent('NuxtLink');

const isRefreshing = ref(false);

// Credentials or providers can flip on Connectors in another tab;
// refresh re-pulls the capability rows so attached / locked state matches.
const onRefresh = async () => {
  isRefreshing.value = true;
  try {
    await refreshCapabilities();
  } finally {
    isRefreshing.value = false;
  }
};
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-4">
      <h2 class="font-semibold">
        Capabilities
      </h2>
      <div class="flex items-center gap-3">
        <NuxtLink
          to="/dashboard/connectors"
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
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="xs"
          label="Refresh"
          :loading="isRefreshing"
          @click="onRefresh"
        />
      </div>
    </div>
    <div
      class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden"
      :aria-busy="pending && !rows ? 'true' : undefined"
    >
      <template v-if="pending && !rows">
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
            <div class="h-4 flex items-center">
              <USkeleton
                class="h-2.5 bg-muted/70"
                :class="CAP_DESC_WIDTHS[(i - 1) % CAP_DESC_WIDTHS.length]"
              />
            </div>
          </div>
          <USkeleton class="h-5 w-16 rounded-sm shrink-0" />
        </div>
      </template>

      <template v-else>
        <component
          :is="isLinkable(capability) ? NuxtLink : 'div'"
          v-for="capability in rows ?? []"
          :key="capability.id"
          :to="isLinkable(capability)
            ? `/dashboard/agents/${agentId}/capabilities/${capability.slug}`
            : undefined"
          class="flex items-center gap-4 p-4"
          :class="isLinkable(capability) ? 'hover:bg-muted transition-colors' : ''"
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

          <UBadge
            v-if="capability.credentialType === 'coming_soon'"
            color="neutral"
            variant="subtle"
            size="sm"
          >
            Coming soon
          </UBadge>
          <UBadge
            v-else-if="capability.attached"
            color="primary"
            variant="subtle"
            size="sm"
          >
            Attached
          </UBadge>
        </component>
      </template>
    </div>
  </div>
</template>
