<script setup lang="ts">
definePageMeta({ layout: false });

interface OpenRouterStatus {
  connected: boolean;
  openrouterUserId?: string | null;
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
            class="h-16 rounded-md border border-muted bg-elevated/40 animate-pulse"
          />

          <div
            v-else
            class="flex items-center justify-between gap-4 p-4 rounded-md border border-muted bg-elevated/40"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium">
                OpenRouter
              </p>
              <p class="text-sm text-toned mt-1 truncate">
                <template v-if="openrouter?.connected">
                  Connected as {{ openrouter.openrouterUserId ?? 'user' }}
                </template>
                <template v-else>
                  Connects your bot to AI models like Claude, GPT, and Gemini.
                </template>
              </p>
            </div>

            <UButton
              v-if="openrouter?.connected"
              color="error"
              variant="outline"
              :loading="disconnecting"
              @click="disconnect"
            >
              Disconnect
            </UButton>
            <UButton
              v-else
              @click="connectOpenRouter"
            >
              Connect
            </UButton>
          </div>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-sm font-medium text-toned">
            Web search
          </h2>

          <div
            v-if="tavilyPending"
            class="h-16 rounded-md border border-muted bg-elevated/40 animate-pulse"
          />

          <div
            v-else
            class="flex flex-col gap-3 p-4 rounded-md border border-muted bg-elevated/40"
          >
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="text-sm font-medium">
                  Tavily
                </p>
                <p class="text-sm text-toned mt-1">
                  <template v-if="tavily?.connected">
                    Connected — bots can use the web_search tool.
                  </template>
                  <template v-else>
                    Powers the web_search tool. Free tier covers 1,000 queries/month.
                  </template>
                </p>
              </div>

              <UButton
                v-if="tavily?.connected"
                color="error"
                variant="outline"
                :loading="tavilyDisconnecting"
                @click="disconnectTavily"
              >
                Disconnect
              </UButton>
            </div>

            <div
              v-if="!tavily?.connected"
              class="flex flex-col gap-2"
            >
              <div class="flex gap-2">
                <UInput
                  v-model="tavilyKey"
                  placeholder="tvly-..."
                  type="password"
                  class="flex-1"
                  @keydown.enter="connectTavily"
                />
                <UButton
                  :loading="tavilyConnecting"
                  :disabled="!tavilyKey.trim()"
                  @click="connectTavily"
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
                >app.tavily.com</a> — sign up takes ~30 seconds.
              </p>
            </div>
          </div>
        </section>
      </div>
    </NuxtLayout>
  </div>
</template>
