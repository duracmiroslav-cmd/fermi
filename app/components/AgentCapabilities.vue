<script setup lang="ts">
import type { AgentCapabilityRow } from '~~/server/utils/capabilities';

const props = defineProps<{
  agentId:   string;
  // Agent-detail (readonly) view lists only enabled capabilities and drops the
  // edit-side header actions; the editable view (agent edit) lists the whole
  // catalog so capabilities can be attached. Both render the same rows + status
  // badges and link into each capability's sub-page.
  readonly?: boolean;
}>();

const { data: rows, pending, refresh: refreshCapabilities } = useApiFetch<AgentCapabilityRow[]>(
  () => `/api/agents/${props.agentId}/capabilities`,
);

const CAP_WIDTHS = ['w-24', 'w-32', 'w-20', 'w-28'];

// Coming-soon rows render as inert info — there's no detail page worth
// navigating to. Every other capability's row links into its sub-page,
// which owns attach/detach and per-tool config.
const isLinkable = (capability: AgentCapabilityRow) =>
  capability.credentialType !== 'coming_soon';

const NuxtLink = resolveComponent('NuxtLink');

const isRefreshing = ref(false);

// Readonly shows only what's enabled; editable shows the whole catalog.
const visibleRows = computed(() =>
  props.readonly ? (rows.value ?? []).filter(c => c.attached) : (rows.value ?? []),
);

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

// The agent detail page refetches this after the agent chat changes the agent's
// capabilities; its page-level refresh only covers the agent, not this fetch.
defineExpose({ refresh: refreshCapabilities });
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-4">
      <h2 class="font-semibold flex items-center gap-2">
        <UIcon
          name="i-lucide-blocks"
          class="size-4 text-toned"
        />
        {{ $t('__titleCapabilities') }}
      </h2>
      <div
        v-if="!readonly"
        class="flex items-center gap-3"
      >
        <NuxtLink
          to="/dashboard/connectors"
          target="_blank"
          rel="noopener"
          class="text-xs text-toned hover:text-highlighted inline-flex items-center gap-1"
        >
          {{ $t('__actionManageCredentials') }}
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
          :label="$t('__actionRefresh')"
          :loading="isRefreshing"
          @click="onRefresh"
        />
      </div>
    </div>

    <UCard v-if="readonly && !pending && visibleRows.length === 0">
      <div class="flex flex-col items-start gap-3">
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
    </UCard>

    <div
      v-else
      class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden"
      :aria-busy="pending && !rows ? 'true' : undefined"
    >
      <template v-if="pending && !rows">
        <div
          v-for="i in 4"
          :key="i"
          class="flex items-center gap-4 p-4"
        >
          <USkeleton class="size-6 shrink-0" />
          <div class="flex-1 min-w-0 flex items-center h-5">
            <USkeleton
              class="h-3"
              :class="CAP_WIDTHS[(i - 1) % CAP_WIDTHS.length]"
            />
          </div>
          <USkeleton class="h-5 w-16 rounded-sm shrink-0" />
        </div>
      </template>

      <template v-else>
        <component
          :is="isLinkable(capability) ? NuxtLink : 'div'"
          v-for="capability in visibleRows"
          :key="capability.id"
          :to="isLinkable(capability)
            ? `/dashboard/agents/${agentId}/capabilities/${capability.slug}`
            : undefined"
          class="flex items-center gap-4 p-4"
          :class="isLinkable(capability) ? 'hover:bg-muted transition-colors' : ''"
        >
          <UIcon
            :name="getCapabilityIcon(capability.slug)"
            class="size-6 text-toned shrink-0"
          />

          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">
              {{ capability.displayName }}
            </p>
          </div>

          <UBadge
            v-if="capability.credentialType === 'coming_soon'"
            color="neutral"
            variant="subtle"
            size="sm"
          >
            {{ $t('__statusComingSoon') }}
          </UBadge>
          <UBadge
            v-else-if="capability.attached && capability.needsConnection"
            color="warning"
            variant="subtle"
            size="sm"
          >
            {{ $t('__statusNeedsConnection') }}
          </UBadge>
          <UBadge
            v-else-if="capability.attached"
            color="primary"
            variant="subtle"
            size="sm"
          >
            {{ $t('__statusAttached') }}
          </UBadge>
        </component>
      </template>
    </div>
  </div>
</template>
