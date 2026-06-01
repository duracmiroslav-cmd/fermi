<script setup lang="ts">
import type { CapabilityProviderRow, CapabilityRow } from '~~/server/utils/capabilities';

definePageMeta({ layout: false });

const route = useRoute();
const { t } = useI18n();
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
  if (cap.credentialType === 'coming_soon') return t('__statusComingSoon');
  if (cap.credentialType === 'none') return t('__statusBuiltIn');
  if (isSelfProvider.value) return null;
  const anyConnected = (cap.providers ?? []).some(p => p.status === 'connected');
  return anyConnected ? t('__statusConnected') : t('__statusAvailable');
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
      notify.success(t('__toastConnectorConnected', { name: label }));
    } catch (e) {
      notify.error(t('__toastConnectorConnectFailed', { name: label }), e);
    } finally {
      connecting.value = false;
    }
  };

  const disconnect = async () => {
    disconnecting.value = true;
    try {
      await $fetch(endpoint, { method: 'DELETE' });
      await refreshCapabilities();
      notify.success(t('__toastConnectorDisconnected', { name: label }));
    } catch (e) {
      notify.error(t('__toastDisconnectFailed'), e);
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
            { label: $t('__labelConnector', 2), to: '/dashboard/connectors' },
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
            <I18nT
              v-if="isSelfProvider && selfProvider?.status === 'connected' && selfProvider.connectedAt"
              keypath="__hintConnectedAt"
              tag="p"
              class="text-sm text-toned mt-1"
            >
              <template #time>
                <TimeAgo :date="selfProvider.connectedAt" />
              </template>
            </I18nT>
            <p
              v-else-if="isSelfProvider"
              class="text-sm text-toned mt-1"
            >
              {{ $t('__statusNotConnected') }}
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
              {{ $t('__descriptionGithubConnector') }}
            </p>
            <UCard>
              <ConnectorCredentialCard
                :label="$t('__labelPersonalAccessToken')"
                mode="key"
                :status="selfProvider!.status"
                :masked-key="selfProvider!.maskedKey"
                :placeholder="selfProvider!.status === 'connected' ? $t('__placeholderReconnectToViewToken') : 'github_pat_...'"
                :connecting="github.connecting.value"
                :disconnecting="github.disconnecting.value"
                @connect="github.connect"
                @disconnect="github.disconnect"
              >
                <template #help>
                  <I18nT
                    keypath="__hintGithubPatHelp"
                    tag="span"
                  >
                    <template #link>
                      <a
                        href="https://github.com/settings/personal-access-tokens"
                        target="_blank"
                        rel="noopener"
                        class="underline"
                      >github.com/settings</a>
                    </template>
                  </I18nT>
                </template>
              </ConnectorCredentialCard>
            </UCard>
          </template>

          <template v-else-if="selfProvider!.slug === 'twinkle-hub'">
            <p class="text-sm text-toned">
              {{ $t('__descriptionTwinkleHubConnector') }}
            </p>
            <UCard>
              <ConnectorCredentialCard
                :label="$t('__labelBearerToken')"
                mode="key"
                :status="selfProvider!.status"
                :masked-key="selfProvider!.maskedKey"
                :placeholder="selfProvider!.status === 'connected' ? $t('__placeholderReconnectToViewToken') : 'sk-...'"
                :connecting="twinkleHub.connecting.value"
                :disconnecting="twinkleHub.disconnecting.value"
                @connect="twinkleHub.connect"
                @disconnect="twinkleHub.disconnect"
              >
                <template #help>
                  <I18nT
                    keypath="__hintTwinkleHubHelp"
                    tag="span"
                  >
                    <template #link>
                      <a
                        href="https://hub.twinkleai.tw"
                        target="_blank"
                        rel="noopener"
                        class="underline"
                      >hub.twinkleai.tw</a>
                    </template>
                  </I18nT>
                </template>
              </ConnectorCredentialCard>
            </UCard>
          </template>
        </template>

        <template v-else-if="capability.credentialType === 'providers' && capability.providers?.length">
          <div class="flex flex-col gap-3">
            <h2 class="text-base font-semibold">
              {{ $t('__titleProviders') }}
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
                    {{ $t('__statusComingSoon') }}
                  </UBadge>
                  <I18nT
                    v-else-if="provider.status === 'connected' && provider.connectedAt"
                    keypath="__hintConnectedAt"
                    tag="span"
                    class="text-xs text-toned"
                  >
                    <template #time>
                      <TimeAgo :date="provider.connectedAt" />
                    </template>
                  </I18nT>
                </div>
              </template>

              <div class="flex flex-col gap-4">
                <template v-if="provider.slug === 'tavily'">
                  <p class="text-sm text-toned">
                    {{ $t('__descriptionTavilyConnector') }}
                  </p>
                  <ConnectorCredentialCard
                    v-if="provider.status !== 'coming_soon'"
                    :label="$t('__labelApiKey')"
                    mode="key"
                    :status="provider.status"
                    :masked-key="provider.maskedKey"
                    :placeholder="provider.status === 'connected' ? $t('__placeholderReconnectToViewKey') : 'tvly-...'"
                    :connecting="tavily.connecting.value"
                    :disconnecting="tavily.disconnecting.value"
                    @connect="tavily.connect"
                    @disconnect="tavily.disconnect"
                  >
                    <template #help>
                      <I18nT
                        keypath="__hintTavilyHelp"
                        tag="span"
                      >
                        <template #link>
                          <a
                            href="https://app.tavily.com"
                            target="_blank"
                            rel="noopener"
                            class="underline"
                          >app.tavily.com</a>
                        </template>
                      </I18nT>
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
          {{ $t('__descriptionAlreadyAvailable') }}
        </p>

        <p
          v-else-if="capability.credentialType === 'coming_soon'"
          class="text-sm text-toned"
        >
          {{ $t('__descriptionOauthInProgress') }}
        </p>
      </DashboardContainer>

      <DashboardContainer v-else>
        <UEmpty
          variant="subtle"
          icon="i-lucide-search-x"
          :title="$t('__titleCapabilityNotFound')"
          :description="$t('__descriptionConnectorPageNotFound')"
          :actions="[{ label: $t('__actionBackToConnectors'), icon: 'i-lucide-arrow-left', to: '/dashboard/connectors' }]"
        />
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
