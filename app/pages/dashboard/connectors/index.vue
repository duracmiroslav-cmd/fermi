<script setup lang="ts">
import type { CapabilityRow } from '~~/server/utils/capabilities';

definePageMeta({ layout: false });

interface OpenRouterStatus {
  connected:         boolean;
  openrouterUserId?: string | null;
  maskedKey?:        string | null;
  connectedAt?:      string;
}

const {
  data: openrouter,
  pending: openrouterPending,
} = useApiFetch<OpenRouterStatus>('/api/oauth/openrouter');

const {
  data: capabilities,
  pending: capabilitiesPending,
} = useApiFetch<CapabilityRow[]>('/api/capabilities');

const searchQuery = ref('');

// BYO custom MCP servers are managed on their own page, so the built-in
// Capabilities list excludes them and a separate section links to the manager.
const flatCards = computed(() =>
  flattenCapabilities((capabilities.value ?? []).filter(c => !c.isCustom)));
const customServerCount = computed(() =>
  (capabilities.value ?? []).filter(c => c.isCustom).length);

// Only actionable rows (connected/available) get linked to their detail
// page; coming-soon and no-credential-needed rows render as static
// surfaces so users don't navigate into a dead-end.
const isLinkable = (card: FlatCard) =>
  card.status === 'connected' || card.status === 'available';

const NuxtLink = resolveComponent('NuxtLink');

// Cycled widths for capability skeleton rows so each row reads as a
// distinct item rather than 6 identical bars.
const CAP_TITLE_WIDTHS = ['w-40', 'w-32', 'w-48', 'w-36'];
const CAP_DESC_WIDTHS = ['w-64', 'w-56', 'w-72', 'w-60'];

const filteredCards = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return flatCards.value;
  return flatCards.value.filter(c => c.searchHaystack.includes(q));
});
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb :items="[{ label: $t('__labelConnector', 2) }]" />
      </template>

      <DashboardContainer>
        <header class="flex flex-col gap-2">
          <h1 class="text-2xl font-semibold">
            {{ $t('__labelConnector', 2) }}
          </h1>
          <p class="text-sm text-toned">
            {{ $t('__descriptionConnectorsPage') }}
          </p>
        </header>

        <section class="flex flex-col gap-3">
          <div class="flex flex-col gap-0.5">
            <h2 class="font-semibold flex items-center gap-2">
              <UIcon
                name="i-lucide-cpu"
                class="size-4 text-toned"
              />
              {{ $t('__titleModelProviders') }}
            </h2>
            <p class="text-sm text-toned">
              {{ $t('__descriptionModelProviders') }}
            </p>
          </div>

          <div
            v-if="openrouterPending && !openrouter"
            class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden"
            aria-busy="true"
          >
            <div class="flex items-center gap-4 p-4">
              <USkeleton class="size-6 rounded shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="h-5 flex items-center">
                  <USkeleton class="h-3 w-40" />
                </div>
                <div class="h-4 flex items-center">
                  <USkeleton class="h-2.5 w-64 bg-muted/70" />
                </div>
              </div>
              <USkeleton class="h-5 w-20 rounded-sm shrink-0" />
            </div>
          </div>

          <div
            v-else
            class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden"
          >
            <NuxtLink
              to="/dashboard/connectors/openrouter"
              class="flex items-center gap-4 p-4 hover:bg-muted transition-colors"
            >
              <UIcon
                name="i-simple-icons-openrouter"
                class="size-6 text-toned shrink-0"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">
                  OpenRouter
                </p>
                <p class="text-xs text-toned">
                  {{ $t('__descriptionOpenrouterListItem') }}
                </p>
              </div>
              <UBadge
                color="neutral"
                variant="subtle"
                size="sm"
              >
                {{ openrouter?.connected ? $t('__statusConnected') : $t('__statusAvailable') }}
              </UBadge>
            </NuxtLink>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <div class="flex flex-col gap-0.5">
            <h2 class="font-semibold flex items-center gap-2">
              <UIcon
                name="i-lucide-blocks"
                class="size-4 text-toned"
              />
              {{ $t('__titleCapabilities') }}
            </h2>
            <p class="text-sm text-toned">
              {{ $t('__descriptionCapabilitiesPage') }}
            </p>
          </div>

          <UInput
            v-model.trim="searchQuery"
            icon="i-lucide-search"
            :placeholder="$t('__placeholderSearchCapabilities')"
            autocomplete="off"
          >
            <template #trailing>
              <UButton
                v-if="searchQuery"
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-x"
                :aria-label="$t('__actionClearSearch')"
                @click="searchQuery = ''"
              />
            </template>
          </UInput>

          <div
            v-if="capabilitiesPending && !capabilities"
            class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden"
            aria-busy="true"
          >
            <div
              v-for="i in 6"
              :key="i"
              class="flex items-center gap-4 p-4"
            >
              <USkeleton class="size-6 rounded shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="h-5 flex items-center">
                  <USkeleton
                    class="h-3"
                    :class="CAP_TITLE_WIDTHS[(i - 1) % CAP_TITLE_WIDTHS.length]"
                  />
                </div>
                <div class="h-4 flex items-center">
                  <USkeleton
                    class="h-2.5 bg-muted/70"
                    :class="CAP_DESC_WIDTHS[(i - 1) % CAP_DESC_WIDTHS.length]"
                  />
                </div>
              </div>
              <USkeleton class="h-5 w-20 rounded-sm shrink-0" />
            </div>
          </div>

          <div
            v-else-if="filteredCards.length"
            class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden"
          >
            <component
              :is="isLinkable(card) ? NuxtLink : 'div'"
              v-for="card in filteredCards"
              :key="card.routeSlug"
              :to="isLinkable(card) ? `/dashboard/connectors/${card.routeSlug}` : undefined"
              class="flex items-center gap-4 p-4"
              :class="isLinkable(card) ? 'hover:bg-muted transition-colors' : ''"
            >
              <UIcon
                :name="card.icon"
                class="size-6 text-toned shrink-0"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">
                  {{ card.title }}
                </p>
                <p
                  v-if="card.description"
                  class="text-xs text-toned"
                >
                  {{ card.description }}
                </p>
              </div>
              <UBadge
                v-if="card.status === 'coming_soon'"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                {{ $t('__statusComingSoon') }}
              </UBadge>
              <UBadge
                v-else-if="card.status === 'none'"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                {{ $t('__statusBuiltIn') }}
              </UBadge>
              <UBadge
                v-else-if="card.status === 'connected'"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                {{ $t('__statusConnected') }}
              </UBadge>
              <UBadge
                v-else-if="card.status === 'available'"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                {{ $t('__statusAvailable') }}
              </UBadge>
            </component>
          </div>

          <p
            v-else
            class="text-sm text-toned text-center py-8"
          >
            {{ $t('__descriptionNoCapabilitiesMatchSearch', { query: searchQuery }) }}
          </p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="font-semibold flex items-center gap-2">
            <UIcon
              name="i-lucide-server"
              class="size-4 text-toned"
            />
            {{ $t('__titleCustomMcpServers') }}
          </h2>

          <div class="rounded-md border border-muted bg-muted/50 divide-y divide-default overflow-hidden">
            <NuxtLink
              to="/dashboard/connectors/mcp"
              class="flex items-center gap-4 p-4 hover:bg-muted transition-colors"
            >
              <UIcon
                name="i-lucide-server"
                class="size-6 text-toned shrink-0"
              />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">
                  {{ $t('__descriptionCustomMcpServersListItem') }}
                </p>
              </div>
              <UBadge
                color="neutral"
                variant="subtle"
                size="sm"
              >
                {{ customServerCount }}
              </UBadge>
            </NuxtLink>
          </div>
        </section>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
