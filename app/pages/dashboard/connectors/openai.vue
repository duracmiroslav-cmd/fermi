<script setup lang="ts">
definePageMeta({ layout: false });

interface OpenaiStatus {
  connected:    boolean;
  maskedKey?:   string | null;
  connectedAt?: string;
}

const {
  data: openai,
  pending,
  isConnecting,
  isDisconnecting,
  runConnect,
  disconnect,
} = useConnector<OpenaiStatus>('/api/connectors/openai', 'OpenAI');

const onConnect = (value: string) => runConnect({ apiKey: value });
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb
          :items="[
            { label: $t('__labelConnector', 2), to: '/dashboard/connectors' },
            { label: 'OpenAI' },
          ]"
        />
      </template>

      <DashboardDetailSkeleton v-if="pending && !openai" />

      <DashboardContainer v-else>
        <header class="flex items-center gap-4">
          <div class="size-12 rounded-full bg-muted flex items-center justify-center shrink-0">
            <UIcon
              name="i-simple-icons-openai"
              class="size-6 text-default"
            />
          </div>
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-semibold truncate">
              OpenAI
            </h1>
            <I18nT
              v-if="openai?.connected && openai.connectedAt"
              keypath="__hintConnectedAt"
              tag="p"
              class="text-sm text-toned mt-1"
            >
              <template #time>
                <TimeAgo :date="openai.connectedAt" />
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
          {{ $t('__descriptionOpenaiConnector') }}
        </p>

        <UCard>
          <ConnectorCredentialCard
            :label="$t('__labelApiKey')"
            mode="key"
            :status="openai?.connected ? 'connected' : 'available'"
            :masked-key="openai?.maskedKey"
            :placeholder="openai?.connected ? $t('__placeholderReconnectToViewKey') : 'sk-...'"
            :connecting="isConnecting"
            :disconnecting="isDisconnecting"
            @connect="onConnect"
            @disconnect="disconnect"
          >
            <template #help>
              <I18nT
                keypath="__hintOpenaiKeyHelp"
                tag="span"
              >
                <template #link>
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener"
                    class="underline"
                  >platform.openai.com/api-keys</a>
                </template>
              </I18nT>
            </template>
          </ConnectorCredentialCard>
        </UCard>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
