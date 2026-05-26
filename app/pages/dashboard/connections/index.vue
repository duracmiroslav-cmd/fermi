<script setup lang="ts">
definePageMeta({ layout: false });

interface OpenRouterStatus {
  connected: boolean;
  openrouterUserId?: string | null;
  maskedKey?: string | null;
  connectedAt?: string;
}

interface TavilyStatus {
  connected: boolean;
  maskedKey?: string | null;
  connectedAt?: string;
}

const {
  data: openrouter,
  pending: openrouterPending,
  isDisconnecting: openrouterDisconnecting,
  disconnect: disconnectOpenRouter,
} = useConnection<OpenRouterStatus>('/api/oauth/openrouter', 'OpenRouter');

const {
  data: tavily,
  pending: tavilyPending,
  isConnecting: tavilyConnecting,
  isDisconnecting: tavilyDisconnecting,
  runConnect: runTavilyConnect,
  disconnect: disconnectTavily,
} = useConnection<TavilyStatus>('/api/connections/tavily', 'Tavily');

useOAuthCallback('openrouter', 'OpenRouter');

const tavilyKey = ref('');

const onOpenRouterConnect = () => {
  window.location.href = '/api/oauth/openrouter/start';
};

const onTavilyConnect = async () => {
  if (!tavilyKey.value) return;
  const ok = await runTavilyConnect({ apiKey: tavilyKey.value });
  if (ok) tavilyKey.value = '';
};
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
            Connect the LLM and tools that power your agent. fermi orchestrates, you bring the keys.
          </p>
        </header>

        <section class="flex flex-col gap-3">
          <div class="flex flex-col gap-0.5">
            <h2 class="text-base font-semibold">
              Models
            </h2>
            <p class="text-sm text-toned">
              Where every message goes for a response.
            </p>
          </div>

          <DashboardCardSkeleton v-if="openrouterPending" />

          <UCard v-else>
            <template #header>
              <div class="flex items-baseline justify-between gap-3">
                <h3 class="text-base font-medium">
                  OpenRouter
                </h3>
                <span
                  v-if="openrouter?.connected && openrouter.connectedAt"
                  class="text-xs text-toned"
                >
                  Connected <TimeAgo :date="openrouter.connectedAt" />
                </span>
              </div>
            </template>

            <div class="flex flex-col gap-4">
              <p class="text-sm text-toned">
                Every message routes through OpenRouter. Pick from Claude, GPT, Gemini, or 200+ other models. Pay OpenRouter as you go, no minimum, fermi takes no cut.
              </p>

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
                    :loading="openrouterDisconnecting"
                    @click="disconnectOpenRouter"
                  >
                    Disconnect
                  </UButton>
                  <UButton
                    v-else
                    trailing-icon="i-lucide-arrow-up-right"
                    @click="onOpenRouterConnect"
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
            </div>
          </UCard>
        </section>

        <section class="flex flex-col gap-3">
          <div class="flex flex-col gap-0.5">
            <h2 class="text-base font-semibold">
              Tools
            </h2>
            <p class="text-sm text-toned">
              Capabilities the agent reaches for beyond chat.
            </p>
          </div>

          <DashboardCardSkeleton v-if="tavilyPending" />

          <UCard v-else>
            <template #header>
              <div class="flex items-baseline justify-between gap-3">
                <h3 class="text-base font-medium">
                  Tavily
                </h3>
                <span
                  v-if="tavily?.connected && tavily.connectedAt"
                  class="text-xs text-toned"
                >
                  Connected <TimeAgo :date="tavily.connectedAt" />
                </span>
              </div>
            </template>

            <div class="flex flex-col gap-4">
              <p class="text-sm text-toned">
                Your agent queries Tavily when it needs the live web: citing sources, checking fresh facts, anything beyond the model's training data. Free for 1,000 searches a month, no card.
              </p>

              <UFormField
                v-if="tavily?.connected"
                label="API key"
              >
                <div class="flex items-end gap-4">
                  <UInput
                    :model-value="tavily.maskedKey ?? ''"
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
                    @click="disconnectTavily"
                  >
                    Disconnect
                  </UButton>
                </div>
              </UFormField>

              <form
                v-else
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
                    >app.tavily.com</a>. 30 seconds, free, no credit card. Paste it back here when you're done.
                  </template>
                </UFormField>
              </form>
            </div>
          </UCard>
        </section>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
