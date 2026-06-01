<script setup lang="ts">
import type { CapabilityProviderRow, CapabilityRow } from '~~/server/utils/capabilities';

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

// "Self provider" = a one-provider capability whose only provider IS the
// capability (slug match). github=github is the canonical case. Render
// these flat like /connectors/openrouter, skipping the "Providers" list
// and the per-provider name/badge header that would otherwise repeat
// the capability name verbatim.
const isSelfProvider = computed(() => {
  const cap = capability.value;
  if (!cap || cap.credentialType !== 'providers') return false;
  const ps = cap.providers ?? [];
  return ps.length === 1 && ps[0]!.slug === cap.slug;
});

const selfProvider = computed<CapabilityProviderRow | null>(() =>
  isSelfProvider.value ? capability.value!.providers![0]! : null,
);

const headline = computed(() => {
  const cap = capability.value;
  if (!cap) return null;
  if (cap.credentialType === 'coming_soon') return 'Coming soon';
  if (cap.credentialType === 'none') return 'Built-in';
  if (isSelfProvider.value) return null;
  const anyConnected = (cap.providers ?? []).some(p => p.status === 'connected');
  return anyConnected ? 'Connected' : 'Available';
});

// Per-provider connect/disconnect action. Status comes from the parent
// /api/capabilities fetch, so this skips the GET that useConnector does.
const makeAction = (endpoint: string, label: string, bodyKey: string) => {
  const connecting = ref(false);
  const disconnecting = ref(false);

  const connect = async (value: string) => {
    if (!value) return;
    connecting.value = true;
    try {
      await $fetch(endpoint, { method: 'POST', body: { [bodyKey]: value } });
      await refreshCapabilities();
      notify.success(`${label} connected`);
    } catch (e) {
      notify.error(`Failed to connect ${label}`, e);
    } finally {
      connecting.value = false;
    }
  };

  const disconnect = async () => {
    disconnecting.value = true;
    try {
      await $fetch(endpoint, { method: 'DELETE' });
      await refreshCapabilities();
      notify.success(`${label} disconnected`);
    } catch (e) {
      notify.error('Disconnect failed', e);
    } finally {
      disconnecting.value = false;
    }
  };

  return { connecting, disconnecting, connect, disconnect };
};

const tavily = makeAction('/api/connectors/tavily', 'Tavily', 'apiKey');
const github = makeAction('/api/connectors/github', 'GitHub', 'token');
const twinkleHub = makeAction('/api/connectors/twinkle-hub', 'Twinkle Hub', 'token');
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb
          :items="[
            { label: 'Connectors', to: '/dashboard/connectors' },
            { label: capability?.displayName ?? '' },
          ]"
          :loading="!capability"
        />
      </template>

      <DashboardDetailSkeleton v-if="pending && !capabilities" />

      <DashboardContainer v-else-if="capability">
        <header class="flex items-center gap-4">
          <div class="size-12 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <UIcon
              :name="getCapabilityIcon(capability.slug)"
              class="size-6 text-primary"
            />
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-semibold truncate">
              {{ capability.displayName }}
            </h1>
            <p
              v-if="isSelfProvider && selfProvider?.status === 'connected' && selfProvider.connectedAt"
              class="text-sm text-toned mt-1"
            >
              Connected <TimeAgo :date="selfProvider.connectedAt" />
            </p>
            <p
              v-else-if="isSelfProvider"
              class="text-sm text-toned mt-1"
            >
              Not connected
            </p>
            <p
              v-else-if="headline"
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

        <template v-if="isSelfProvider && selfProvider!.status !== 'coming_soon'">
          <template v-if="selfProvider!.slug === 'github'">
            <p class="text-sm text-toned">
              Connect a fine-grained personal access token. fermi only exposes read-only GitHub tools regardless of the token's scope, so granting read access on the repos you want the agent to see is enough.
            </p>
            <UCard>
              <ConnectorCredentialCard
                label="Personal access token"
                mode="key"
                :status="selfProvider!.status"
                :masked-key="selfProvider!.maskedKey"
                :placeholder="selfProvider!.status === 'connected' ? 'Reconnect to view token' : 'github_pat_...'"
                :connecting="github.connecting.value"
                :disconnecting="github.disconnecting.value"
                @connect="github.connect"
                @disconnect="github.disconnect"
              >
                <template #help>
                  Create a fine-grained PAT at
                  <a
                    href="https://github.com/settings/personal-access-tokens"
                    target="_blank"
                    rel="noopener"
                    class="underline"
                  >github.com/settings</a>. Pick the repos and grant read access.
                </template>
              </ConnectorCredentialCard>
            </UCard>
          </template>

          <template v-else-if="selfProvider!.slug === 'twinkle-hub'">
            <p class="text-sm text-toned">
              Twinkle Hub bundles 50+ Taiwan-specific lookup tools and the full data.gov.tw open-data catalog behind a single MCP endpoint. Free during alpha.
            </p>
            <UCard>
              <ConnectorCredentialCard
                label="Bearer token"
                mode="key"
                :status="selfProvider!.status"
                :masked-key="selfProvider!.maskedKey"
                :placeholder="selfProvider!.status === 'connected' ? 'Reconnect to view token' : 'sk-...'"
                :connecting="twinkleHub.connecting.value"
                :disconnecting="twinkleHub.disconnecting.value"
                @connect="twinkleHub.connect"
                @disconnect="twinkleHub.disconnect"
              >
                <template #help>
                  Sign in at
                  <a
                    href="https://hub.twinkleai.tw"
                    target="_blank"
                    rel="noopener"
                    class="underline"
                  >hub.twinkleai.tw</a>
                  with Google or GitHub, then copy your token from the dashboard.
                </template>
              </ConnectorCredentialCard>
            </UCard>
          </template>
        </template>

        <template v-else-if="capability.credentialType === 'providers' && capability.providers?.length">
          <div class="flex flex-col gap-3">
            <h2 class="text-base font-semibold">
              Providers
            </h2>
            <UCard
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
                <template v-if="provider.slug === 'tavily'">
                  <p class="text-sm text-toned">
                    Tavily is a web search API tuned for LLM agents. 1K searches a month free, no credit card.
                  </p>
                  <ConnectorCredentialCard
                    v-if="provider.status !== 'coming_soon'"
                    label="API key"
                    mode="key"
                    :status="provider.status"
                    :masked-key="provider.maskedKey"
                    :placeholder="provider.status === 'connected' ? 'Reconnect to view key' : 'tvly-...'"
                    :connecting="tavily.connecting.value"
                    :disconnecting="tavily.disconnecting.value"
                    @connect="tavily.connect"
                    @disconnect="tavily.disconnect"
                  >
                    <template #help>
                      Grab a key at
                      <a
                        href="https://app.tavily.com"
                        target="_blank"
                        rel="noopener"
                        class="underline"
                      >app.tavily.com</a>. 30 seconds, free, no credit card.
                    </template>
                  </ConnectorCredentialCard>
                </template>
              </div>
            </UCard>
          </div>
        </template>

        <p
          v-else-if="capability.credentialType === 'none'"
          class="text-sm text-toned"
        >
          Already available. Attach this on any agent's page to use it.
        </p>

        <p
          v-else-if="capability.credentialType === 'coming_soon'"
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
          :actions="[{ label: 'Back to Connectors', icon: 'i-lucide-arrow-left', to: '/dashboard/connectors' }]"
        />
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
