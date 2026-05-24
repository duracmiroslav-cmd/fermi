<script setup lang="ts">
interface OpenRouterStatus {
  connected: boolean;
  openrouterUserId?: string | null;
  connectedAt?: string;
}

const route = useRoute();
const router = useRouter();
const toast = useToast();

const { data: openrouter, refresh } = await useFetch<OpenRouterStatus>('/api/oauth/openrouter', {
  headers: useRequestHeaders(['cookie']),
});
const disconnecting = ref(false);

onMounted(() => {
  const result = route.query.openrouter;
  if (result === 'connected') {
    toast.add({ title: 'OpenRouter connected', color: 'success' });
  }
  else if (result === 'error') {
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
  }
  catch (e) {
    toast.add({
      title: 'Disconnect failed',
      description: e instanceof Error ? e.message : 'Unknown error',
      color: 'error',
    });
  }
  finally {
    disconnecting.value = false;
  }
};
</script>

<template>
  <NuxtLayout name="dashboard">
    <template #title>
      connections
    </template>

    <div class="p-6 sm:p-8 max-w-3xl space-y-8">
      <section>
        <h2 class="font-mono text-xs uppercase tracking-wider text-dimmed mb-4">
          llm providers
        </h2>
        <UCard>
          <div class="flex items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="font-medium">
                OpenRouter
              </p>
              <p class="text-sm text-muted mt-1">
                <template v-if="openrouter?.connected">
                  Connected as {{ openrouter.openrouterUserId ?? 'user' }}
                </template>
                <template v-else>
                  Required to run text and vision LLM calls
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
        </UCard>
      </section>
    </div>
  </NuxtLayout>
</template>
