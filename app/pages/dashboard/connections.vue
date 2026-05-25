<script setup lang="ts">
definePageMeta({ layout: false });

interface OpenRouterStatus {
  connected: boolean;
  openrouterUserId?: string | null;
  connectedAt?: string;
}

const route = useRoute();
const router = useRouter();
const toast = useToast();

const { data: openrouter, refresh, pending } = useLazyFetch<OpenRouterStatus>('/api/oauth/openrouter', {
  headers: useRequestHeaders(['cookie']),
});
const disconnecting = ref(false);

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
              <p class="text-sm text-muted mt-1 truncate">
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
      </div>
    </NuxtLayout>
  </div>
</template>
