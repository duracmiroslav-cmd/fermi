<script setup lang="ts">
definePageMeta({ layout: false });

// fermion is the home only for owners who can run it (Pro, or Free with their
// own OpenRouter). The home carries nothing else, so send everyone else
// straight to their bot list rather than render an empty shell. Awaited so
// the openrouter status is resolved before the SSR redirect decides.
const profile = useProfile();
const { data: openrouter } = await useApiFetch<{ connected: boolean }>('/api/oauth/openrouter');
const canUseFermion = computed(() => canAccessFermion(profile.value?.tier, !!openrouter.value?.connected));
if (!canUseFermion.value) {
  await navigateTo('/dashboard/bots');
}
</script>

<template>
  <div>
    <NuxtLayout name="dashboard">
      <template #title>
        <DashboardBreadcrumb :items="[]" />
      </template>

      <div class="h-full px-6 sm:px-8 py-6 w-full">
        <FermionChat
          v-if="canUseFermion"
          home
        />
      </div>
    </NuxtLayout>
  </div>
</template>
