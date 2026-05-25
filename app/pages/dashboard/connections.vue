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
  connectedAt?: string;
}

const route = useRoute();
const router = useRouter();
const toast = useToast();

const { data: openrouter, refresh, pending } = useLazyFetch<OpenRouterStatus>('/api/oauth/openrouter', {
  headers: useRequestHeaders(['cookie']),
});
const disconnecting = ref(false);

const {
  data: tavily,
  refresh: refreshTavily,
  pending: tavilyPending,
} = useLazyFetch<TavilyStatus>('/api/connections/tavily', {
  headers: useRequestHeaders(['cookie']),
});
const tavilyKey = ref('');
const tavilyConnecting = ref(false);
const tavilyDisconnecting = ref(false);

onMounted(() => {
  const result = route.query.openrouter;
  if (result === 'connected') {
    toast.add({ title: 'OpenRouter connected', color: 'success' });
  } else if (result === 'error') {
    const reason = typeof route.query.reason === 'string' ? route.query.reason : 'unknown';
    toast.add({ title: 'OpenRouter connection failed', description: reason, color: 'error' });
  }
  if (result) {
    router.replace({ query: {} });
  }
});

const connectOpenRouter = () => {
  window.location.href = '/api/oauth/openrouter/start';
};

const disconnect = async () => {
  disconnecting.value = true;
  try {
    await $fetch('/api/oauth/openrouter', { method: 'DELETE' });
    await refresh();
    toast.add({ title: 'OpenRouter disconnected', color: 'success' });
  } catch (e) {
    toast.add({
      title: 'Disconnect failed',
      description: extractErrorMessage(e),
      color: 'error',
    });
  } finally {
    disconnecting.value = false;
  }
};

const connectTavily = async () => {
  const key = tavilyKey.value.trim();
  if (!key) return;
  tavilyConnecting.value = true;
  try {
    await $fetch('/api/connections/tavily', {
      method: 'POST',
      body: { apiKey: key },
    });
    tavilyKey.value = '';
    await refreshTavily();
    toast.add({ title: 'Tavily connected', color: 'success' });
  } catch (e) {
    toast.add({
      title: 'Tavily connection failed',
      description: extractErrorMessage(e),
      color: 'error',
    });
  } finally {
    tavilyConnecting.value = false;
  }
};

const disconnectTavily = async () => {
  tavilyDisconnecting.value = true;
  try {
    await $fetch('/api/connections/tavily', { method: 'DELETE' });
    await refreshTavily();
    toast.add({ title: 'Tavily disconnected', color: 'success' });
  } catch (e) {
    toast.add({
      title: 'Disconnect failed',
      description: extractErrorMessage(e),
      color: 'error',
    });
  } finally {
    tavilyDisconnecting.value = false;
  }
};
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb :items="[{ label: 'Connections' }]" />
      </template>

      <div class="p-6 sm:p-8 pb-12 max-w-3xl flex flex-col gap-8">
        <h1 class="text-2xl font-semibold">
          Connections
        </h1>

        <section class="flex flex-col gap-3">
          <h2 class="text-sm font-medium text-toned">
            LLM providers
          </h2>

          <div
            v-if="pending"
            class="h-28 rounded-md border border-muted bg-elevated/50 animate-pulse"
          />

          <UCard v-else>
            <template #header>
              <h3 class="text-base font-medium">
                OpenRouter
              </h3>
            </template>

            <div class="flex flex-col gap-3">
              <p class="text-sm text-toned">
                OpenRouter routes chat completions to Claude, GPT, Gemini, and free models.
              </p>

              <div class="grid grid-cols-12 gap-4 items-end">
                <UFormField
                  label="API key"
                  class="col-span-9"
                >
                  <UInput
                    :model-value="openrouter?.maskedKey ?? ''"
                    readonly
                    placeholder="Not connected"
                    autocomplete="off"
                    :ui="{ base: 'font-mono' }"
                  />
                </UFormField>

                <div class="col-span-3">
                  <UButton
                    v-if="openrouter?.connected"
                    block
                    color="error"
                    variant="outline"
                    :loading="disconnecting"
                    @click="disconnect"
                  >
                    Disconnect
                  </UButton>
                  <UButton
                    v-else
                    block
                    @click="connectOpenRouter"
                  >
                    Connect
                  </UButton>
                </div>
              </div>
            </div>
          </UCard>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-sm font-medium text-toned">
            Web search
          </h2>

          <div
            v-if="tavilyPending"
            class="h-28 rounded-md border border-muted bg-elevated/50 animate-pulse"
          />

          <UCard v-else>
            <template #header>
              <h3 class="text-base font-medium">
                Tavily
              </h3>
            </template>

            <div class="flex flex-col gap-3">
              <div class="grid grid-cols-12 gap-4 items-center">
                <p class="col-span-9 text-sm text-toned min-w-0">
                  <template v-if="tavily?.connected">
                    Bots can use the <span class="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">web_search</span> tool.
                  </template>
                  <template v-else>
                    Tavily powers the <span class="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">web_search</span> tool. Free tier covers 1,000 queries/month.
                  </template>
                </p>

                <div class="col-span-3">
                  <UButton
                    v-if="tavily?.connected"
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
                v-if="!tavily?.connected"
                class="flex flex-col gap-2"
                @submit.prevent="connectTavily"
              >
                <div class="grid grid-cols-12 gap-4">
                  <UInput
                    v-model="tavilyKey"
                    placeholder="tvly-..."
                    type="password"
                    autocomplete="off"
                    class="col-span-9"
                  />
                  <UButton
                    type="submit"
                    block
                    class="col-span-3"
                    :loading="tavilyConnecting"
                    :disabled="!tavilyKey.trim()"
                  >
                    Connect
                  </UButton>
                </div>
                <p class="text-xs text-toned">
                  Grab a key at <a
                    href="https://app.tavily.com"
                    target="_blank"
                    rel="noopener"
                    class="underline"
                  >app.tavily.com</a>. Sign up takes about 30 seconds.
                </p>
              </form>
            </div>
          </UCard>
        </section>
      </div>
    </NuxtLayout>
  </div>
</template>
