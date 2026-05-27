<script setup lang="ts">
import type { CapabilityRow } from '~~/server/utils/capabilities';

definePageMeta({ layout: false });

const route = useRoute();
const notify = useNotify();

const {
  data: capabilities,
  refresh: refreshCapabilities,
  pending,
} = useApiFetch<CapabilityRow[]>('/api/capabilities');

const capability = computed(() =>
  (capabilities.value ?? []).find(c => c.slug === route.params.slug),
);

const headline = computed(() => {
  const cap = capability.value;
  if (!cap) return null;
  if (cap.credentialKind === 'coming_soon') return 'Coming soon';
  if (cap.credentialKind === 'none') return 'Built-in';
  const anyConnected = (cap.providers ?? []).some(p => p.status === 'connected');
  return anyConnected ? 'Connected' : 'Available';
});

const tavilyKey = ref('');
const tavilyConnecting = ref(false);
const tavilyDisconnecting = ref(false);

const onTavilyConnect = async () => {
  if (!tavilyKey.value) return;
  tavilyConnecting.value = true;
  try {
    await $fetch('/api/connections/tavily', {
      method: 'POST',
      body:   { apiKey: tavilyKey.value },
    });
    tavilyKey.value = '';
    await refreshCapabilities();
    notify.success('Tavily connected');
  } catch (e) {
    notify.error('Tavily connection failed', e);
  } finally {
    tavilyConnecting.value = false;
  }
};

const onTavilyDisconnect = async () => {
  tavilyDisconnecting.value = true;
  try {
    await $fetch('/api/connections/tavily', { method: 'DELETE' });
    await refreshCapabilities();
    notify.success('Tavily disconnected');
  } catch (e) {
    notify.error('Disconnect failed', e);
  } finally {
    tavilyDisconnecting.value = false;
  }
};
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb
          :items="[
            { label: 'Connections', to: '/dashboard/connections' },
            { label: capability?.displayName ?? '' },
          ]"
          :loading="!capability"
        />
      </template>

      <DashboardDetailSkeleton
        v-if="pending && !capabilities"
        :fields="2"
      />

      <DashboardContainer v-else-if="capability">
        <header class="flex items-center gap-4">
          <div class="size-12 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <UIcon
              :name="capabilityIcon(capability.slug)"
              class="size-6 text-primary"
            />
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-semibold truncate">
              {{ capability.displayName }}
            </h1>
            <p
              v-if="headline"
              class="text-sm text-toned mt-1"
            >
              {{ headline }}
            </p>
          </div>
        </header>

        <p
          v-if="capability.description"
          class="text-sm text-default"
        >
          {{ capability.description }}
        </p>

        <template v-if="capability.credentialKind === 'providers' && capability.providers?.length">
          <div class="flex flex-col gap-3">
            <h2 class="text-base font-semibold">
              Providers
            </h2>
            <BaseCard
              v-for="provider in capability.providers"
              :key="provider.slug"
            >
              <template #header>
                <div class="flex items-center justify-between gap-3">
                  <h3 class="text-base font-medium">
                    {{ provider.displayName }}
                  </h3>
                  <UBadge
                    v-if="provider.status === 'coming_soon'"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  >
                    Coming soon
                  </UBadge>
                  <span
                    v-else-if="provider.status === 'connected' && provider.connectedAt"
                    class="text-xs text-toned"
                  >
                    Connected <TimeAgo :date="provider.connectedAt" />
                  </span>
                </div>
              </template>

              <div class="flex flex-col gap-4">
                <p
                  v-if="provider.slug === 'tavily'"
                  class="text-sm text-toned"
                >
                  Tavily is a web search API tuned for LLM agents. 1K searches a month free, no credit card.
                </p>

                <template v-if="provider.slug === 'tavily' && provider.status === 'connected'">
                  <UFormField label="API key">
                    <div class="flex items-end gap-4">
                      <UInput
                        :model-value="provider.maskedKey ?? ''"
                        readonly
                        icon="i-lucide-key-round"
                        placeholder="Reconnect to view key"
                        autocomplete="off"
                        class="flex-1 min-w-0"
                      />
                      <UButton
                        color="error"
                        variant="outline"
                        :loading="tavilyDisconnecting"
                        @click="onTavilyDisconnect"
                      >
                        Disconnect
                      </UButton>
                    </div>
                  </UFormField>
                </template>

                <form
                  v-else-if="provider.slug === 'tavily' && provider.status === 'available'"
                  @submit.prevent="onTavilyConnect"
                >
                  <UFormField label="API key">
                    <div class="flex items-end gap-4">
                      <UInput
                        v-model.trim="tavilyKey"
                        icon="i-lucide-key-round"
                        placeholder="tvly-..."
                        type="password"
                        autocomplete="off"
                        class="flex-1 min-w-0"
                      />
                      <UButton
                        type="submit"
                        trailing-icon="i-lucide-arrow-right"
                        :loading="tavilyConnecting"
                        :disabled="!tavilyKey.trim()"
                      >
                        Connect
                      </UButton>
                    </div>
                    <template #help>
                      Grab a key at
                      <a
                        href="https://app.tavily.com"
                        target="_blank"
                        rel="noopener"
                        class="underline"
                      >app.tavily.com</a>. 30 seconds, free, no credit card.
                    </template>
                  </UFormField>
                </form>
              </div>
            </BaseCard>
          </div>
        </template>

        <p
          v-else-if="capability.credentialKind === 'none'"
          class="text-sm text-toned"
        >
          Already available. Attach this on any agent's page to use it.
        </p>

        <p
          v-else-if="capability.credentialKind === 'coming_soon'"
          class="text-sm text-toned"
        >
          OAuth integration in progress. Check back soon.
        </p>
      </DashboardContainer>

      <DashboardContainer v-else>
        <UEmpty
          variant="subtle"
          icon="i-lucide-search-x"
          title="Capability not found"
          description="This page may have been removed, or the link is wrong."
          :actions="[{ label: 'Back to Connections', icon: 'i-lucide-arrow-left', to: '/dashboard/connections' }]"
        />
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
