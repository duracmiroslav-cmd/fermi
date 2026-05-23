<script setup lang="ts">
interface OpenRouterStatus {
  connected: boolean;
  openrouterUserId?: string | null;
  connectedAt?: string;
}

const supabase = useSupabaseClient();
const user = useSupabaseUser();
const route = useRoute();
const router = useRouter();
const toast = useToast();

// useFetch SSR doesn't forward client cookies by default, so the
// internal call to /api/oauth/openrouter loses the Supabase session
// and serverSupabaseUser() can't identify the user.
const { data: openrouter, refresh } = await useFetch<OpenRouterStatus>('/api/oauth/openrouter', {
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
      description: e instanceof Error ? e.message : 'Unknown error',
      color: 'error',
    });
  } finally {
    disconnecting.value = false;
  }
};

const signOut = async () => {
  await supabase.auth.signOut();
  await navigateTo('/sign-in');
};
</script>

<template>
  <div class="min-h-screen flex flex-col items-center py-12 px-4 gap-8">
    <div class="w-full max-w-xl flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">
          Dashboard
        </h1>
        <p class="text-sm text-gray-500">
          {{ user?.email }}
        </p>
      </div>
      <UButton
        variant="outline"
        @click="signOut"
      >
        Sign out
      </UButton>
    </div>

    <UCard class="w-full max-w-xl">
      <template #header>
        <h2 class="font-semibold">
          Connections
        </h2>
      </template>

      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="font-medium">
            OpenRouter
          </p>
          <p class="text-sm text-gray-500">
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
  </div>
</template>
