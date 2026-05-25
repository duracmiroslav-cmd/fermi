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

          <div
            v-if="openrouterPending"
            class="h-28 rounded-md border border-muted bg-elevated/50 animate-pulse"
          />

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

              <div class="flex flex-col gap-2">
                <div class="grid grid-cols-12 gap-4 items-end">
                  <UFormField
                    label="API key"
                    class="col-span-9"
                  >
                    <UInput
                      :model-value="openrouter?.maskedKey ?? ''"
                      readonly
                      icon="i-lucide-key-round"
                      :placeholder="openrouter?.connected ? 'Reconnect to view key' : 'Not connected'"
                      autocomplete="off"
                    />
                  </UFormField>

                  <div class="col-span-3">
                    <UButton
                      v-if="openrouter?.connected"
                      block
                      color="error"
                      variant="outline"
                      :loading="openrouterDisconnecting"
                      @click="disconnectOpenRouter"
                    >
                      Disconnect
                    </UButton>
                    <UButton
                      v-else
                      block
                      trailing-icon="i-lucide-arrow-up-right"
                      @click="onOpenRouterConnect"
                    >
                      Connect
                    </UButton>
                  </div>
                </div>

                <p
                  v-if="!openrouter?.connected"
                  class="text-xs text-toned"
                >
                  New to OpenRouter? Free signup, takes a minute.
                </p>
              </div>
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

          <div
            v-if="tavilyPending"
            class="h-28 rounded-md border border-muted bg-elevated/50 animate-pulse"
          />

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

              <div class="flex flex-col gap-2">
                <div
                  v-if="tavily?.connected"
                  class="grid grid-cols-12 gap-4 items-end"
                >
                  <UFormField
                    label="API key"
                    class="col-span-9"
                  >
                    <UInput
                      :model-value="tavily.maskedKey ?? ''"
                      readonly
                      icon="i-lucide-key-round"
                      placeholder="Reconnect to view key"
                      autocomplete="off"
                    />
                  </UFormField>

                  <div class="col-span-3">
                    <UButton
                      block
                      color="error"
                      variant="outline"
                      :loading="tavilyDisconnecting"
                      @click="disconnectTavily"
                    >
                      Disconnect
                    </UButton>
                  </div>
                </div>

                <form
                  v-else
                  class="grid grid-cols-12 gap-4 items-end"
                  @submit.prevent="onTavilyConnect"
                >
                  <UFormField
                    label="API key"
                    class="col-span-9"
                  >
                    <UInput
                      v-model.trim="tavilyKey"
                      icon="i-lucide-key-round"
                      placeholder="tvly-..."
                      type="password"
                      autocomplete="off"
                    />
                  </UFormField>

                  <div class="col-span-3">
                    <UButton
                      type="submit"
                      block
                      trailing-icon="i-lucide-arrow-right"
                      :loading="tavilyConnecting"
                      :disabled="!tavilyKey.trim()"
                    >
                      Connect
                    </UButton>
                  </div>
                </form>

                <p
                  v-if="!tavily?.connected"
                  class="text-xs text-toned"
                >
                  Grab a key at
                  <a
                    href="https://app.tavily.com"
                    target="_blank"
                    rel="noopener"
                    class="underline"
                  >app.tavily.com</a>. 30 seconds, free, no credit card. Paste it back here when you're done.
                </p>
              </div>
            </div>
          </UCard>
        </section>
      </DashboardContainer>
    </NuxtLayout>
  </div>
</template>
