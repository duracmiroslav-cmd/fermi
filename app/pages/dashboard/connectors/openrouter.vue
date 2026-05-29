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
            { label: 'Connectors', to: '/dashboard/connectors' },
            { label: 'OpenRouter' },
          ]"
        />
      </template>

      <DashboardDetailSkeleton v-if="pending && !openrouter" />

      <DashboardContainer v-else>
        <header class="flex items-center gap-4">
          <div class="size-12 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <UIcon
              name="i-simple-icons-openrouter"
              class="size-6 text-primary"
            />
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-semibold truncate">
              OpenRouter
            </h1>
            <p
              v-if="openrouter?.connected && openrouter.connectedAt"
              class="text-sm text-toned mt-1"
            >
              Connected <TimeAgo :date="openrouter.connectedAt" />
            </p>
            <p
              v-else
              class="text-sm text-toned mt-1"
            >
              Not connected
            </p>
          </div>
        </header>

        <p class="text-sm text-default">
          Every message routes through OpenRouter. Pick from Claude, GPT, Gemini, or 200+ other models. Pay OpenRouter as you go, no minimum, fermi takes no cut.
        </p>

        <UCard>
          <ConnectorCredentialCard
            label="API key"
            mode="oauth"
            :status="openrouter?.connected ? 'connected' : 'available'"
            :masked-key="openrouter?.maskedKey"
            :placeholder="openrouter?.connected ? 'Reconnect to view key' : 'Not connected'"
            :disconnecting="isDisconnecting"
            @connect="onConnect"
            @disconnect="disconnect"
          >
            <template #help>
              New to OpenRouter? Free signup, takes a minute.
            </template>
          </ConnectorCredentialCard>
        </UCard>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
