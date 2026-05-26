<script setup lang="ts">
definePageMeta({ layout: false });

interface OpenRouterStatus {
  connected: boolean;
  openrouterUserId?: string | null;
  maskedKey?: string | null;
  connectedAt?: string;
}

const {
  data: openrouter,
  pending,
  isDisconnecting,
  disconnect,
} = useConnection<OpenRouterStatus>('/api/oauth/openrouter', 'OpenRouter');

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
            { label: 'Connections', to: '/dashboard/connections' },
            { label: 'OpenRouter' },
          ]"
        />
      </template>

      <DashboardDetailSkeleton
        v-if="pending && !openrouter"
        :fields="2"
      />

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
          <UFormField label="API key">
            <div class="flex items-end gap-4">
              <UInput
                :model-value="openrouter?.maskedKey ?? ''"
                readonly
                icon="i-lucide-key-round"
                :placeholder="openrouter?.connected ? 'Reconnect to view key' : 'Not connected'"
                autocomplete="off"
                class="flex-1 min-w-0"
              />
              <UButton
                v-if="openrouter?.connected"
                color="error"
                variant="outline"
                :loading="isDisconnecting"
                @click="disconnect"
              >
                Disconnect
              </UButton>
              <UButton
                v-else
                trailing-icon="i-lucide-arrow-up-right"
                @click="onConnect"
              >
                Connect
              </UButton>
            </div>
            <template
              v-if="!openrouter?.connected"
              #help
            >
              New to OpenRouter? Free signup, takes a minute.
            </template>
          </UFormField>
        </UCard>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
