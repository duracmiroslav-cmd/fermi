<script setup lang="ts">
import type { CapabilityRow } from '~~/server/utils/capabilities';

definePageMeta({ layout: false });

interface OpenRouterStatus {
  connected: boolean;
  openrouterUserId?: string | null;
  maskedKey?: string | null;
  connectedAt?: string;
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

const flatCards = computed(() => flattenCapabilities(capabilities.value ?? []));

// Only actionable rows (connected/available) get linked to their detail
// page; coming-soon and no-credential-needed rows render as static
// surfaces so users don't navigate into a dead-end.
const isLinkable = (card: FlatCard) =>
  card.status === 'connected' || card.status === 'available';

const NuxtLink = resolveComponent('NuxtLink');

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
        <DashboardBreadcrumb :items="[{ label: 'Connections' }]" />
      </template>

      <DashboardContainer>
        <header class="flex flex-col gap-2">
          <h1 class="text-2xl font-semibold">
            Connections
          </h1>
          <p class="text-sm text-toned">
            Wire up the LLM and capabilities your agents can reach for. Credentials live here. Attach per-agent on each agent's page.
          </p>
        </header>

        <section class="flex flex-col gap-3">
          <div class="flex flex-col gap-0.5">
            <h2 class="text-base font-semibold">
              Model providers
            </h2>
            <p class="text-sm text-toned">
              Where every message goes for a response.
            </p>
          </div>

          <div
            v-if="openrouterPending && !openrouter"
            class="flex items-center gap-4 p-4 sm:p-6 rounded-md ring ring-inset ring-muted bg-elevated/50"
            aria-busy="true"
          >
            <USkeleton class="size-5 rounded shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="h-6 flex items-center">
                <USkeleton class="h-3.5 w-32" />
              </div>
              <div class="h-5 flex items-center">
                <USkeleton class="h-3 w-64 bg-muted/70" />
              </div>
            </div>
            <USkeleton class="h-3 w-20 bg-muted/70 shrink-0" />
          </div>

          <NuxtLink
            v-else
            to="/dashboard/connections/openrouter"
            class="block"
          >
            <UCard class="transition-colors hover:bg-elevated">
              <div class="flex items-center gap-4">
                <UIcon
                  name="i-simple-icons-openrouter"
                  class="size-5 text-toned shrink-0"
                />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">
                    OpenRouter
                  </p>
                  <p class="text-xs text-toned">
                    Routes messages to Claude, GPT, Gemini, and 200+ other models.
                  </p>
                </div>
                <UBadge
                  v-if="openrouter?.connected"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  Connected
                </UBadge>
                <UBadge
                  v-else
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  Available
                </UBadge>
              </div>
            </UCard>
          </NuxtLink>
        </section>

        <section class="flex flex-col gap-3">
          <div class="flex flex-col gap-0.5">
            <h2 class="text-base font-semibold">
              Capabilities
            </h2>
            <p class="text-sm text-toned">
              Tools your agents can reach for beyond chat. Attach per agent on each agent's page.
            </p>
          </div>

          <UInput
            v-model.trim="searchQuery"
            icon="i-lucide-search"
            placeholder="Search capabilities..."
            autocomplete="off"
          >
            <template #trailing>
              <UButton
                v-if="searchQuery"
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-x"
                aria-label="Clear search"
                @click="searchQuery = ''"
              />
            </template>
          </UInput>

          <div
            v-if="capabilitiesPending && !capabilities"
            class="rounded-md border border-muted bg-elevated/50 divide-y divide-default overflow-hidden"
            aria-busy="true"
          >
            <div
              v-for="i in 6"
              :key="i"
              class="flex items-center gap-4 p-4"
            >
              <USkeleton class="size-5 rounded shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="h-5 flex items-center">
                  <USkeleton class="h-3 w-40" />
                </div>
                <div class="h-4 flex items-center">
                  <USkeleton class="h-2.5 w-64 bg-muted/70" />
                </div>
              </div>
              <USkeleton class="h-3 w-20 bg-muted/70 shrink-0" />
            </div>
          </div>

          <div
            v-else-if="filteredCards.length"
            class="rounded-md border border-muted bg-elevated/50 divide-y divide-default overflow-hidden"
          >
            <component
              :is="isLinkable(card) ? NuxtLink : 'div'"
              v-for="card in filteredCards"
              :key="card.routeSlug"
              :to="isLinkable(card) ? `/dashboard/connections/${card.routeSlug}` : undefined"
              class="flex items-center gap-4 p-4"
              :class="isLinkable(card) ? 'hover:bg-elevated transition-colors' : ''"
            >
              <UIcon
                :name="card.icon"
                class="size-5 text-toned shrink-0"
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
                Coming soon
              </UBadge>
              <UBadge
                v-else-if="card.status === 'none'"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                Built-in
              </UBadge>
              <UBadge
                v-else-if="card.status === 'connected'"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                Connected
              </UBadge>
              <UBadge
                v-else-if="card.status === 'available'"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                Available
              </UBadge>
            </component>
          </div>

          <p
            v-else
            class="text-sm text-toned text-center py-8"
          >
            No capabilities match "{{ searchQuery }}".
          </p>
        </section>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
