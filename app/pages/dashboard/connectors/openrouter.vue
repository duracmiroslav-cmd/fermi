<script setup lang="ts">
definePageMeta({ layout: false });

interface OpenRouterStatus {
  connected:         boolean;
  openrouterUserId?: string | null;
  maskedKey?:        string | null;
  connectedAt?:      string;
}

const {
  data: openrouter,
  pending,
  isDisconnecting,
  disconnect,
} = useConnector<OpenRouterStatus>('/api/oauth/openrouter', 'OpenRouter');

useOAuthCallback('openrouter', 'OpenRouter');

const onConnect = () => {
  window.location.href = '/api/oauth/openrouter/start';
};
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb
          :items="[
            { label: $t('__labelConnector', 2), to: '/dashboard/connectors' },
            { label: 'OpenRouter' },
          ]"
        />
      </template>

      <DashboardDetailSkeleton v-if="pending && !openrouter" />

      <DashboardContainer v-else>
        <header class="flex items-center gap-4">
          <div class="size-12 rounded-full bg-muted flex items-center justify-center shrink-0">
            <UIcon
              name="i-simple-icons-openrouter"
              class="size-6 text-default"
            />
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-semibold truncate">
              OpenRouter
            </h1>
            <I18nT
              v-if="openrouter?.connected && openrouter.connectedAt"
              keypath="__hintConnectedAt"
              tag="p"
              class="text-sm text-toned mt-1"
            >
              <template #time>
                <TimeAgo :date="openrouter.connectedAt" />
              </template>
            </I18nT>
            <p
              v-else
              class="text-sm text-toned mt-1"
            >
              {{ $t('__statusNotConnected') }}
            </p>
          </div>
        </header>

        <p class="text-sm text-default">
          {{ $t('__descriptionOpenrouterConnector') }}
        </p>

        <UCard>
          <ConnectorCredentialCard
            :label="$t('__labelApiKey')"
            mode="oauth"
            :status="openrouter?.connected ? 'connected' : 'available'"
            :masked-key="openrouter?.maskedKey"
            :placeholder="openrouter?.connected ? $t('__placeholderReconnectToViewKey') : $t('__placeholderNotConnected')"
            :disconnecting="isDisconnecting"
            @connect="onConnect"
            @disconnect="disconnect"
          >
            <template #help>
              {{ $t('__hintOpenrouterSignup') }}
            </template>
          </ConnectorCredentialCard>
        </UCard>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
