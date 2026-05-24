<script setup lang="ts">
import { normalizeLocale } from '~~/shared/locale';

const supabase = useSupabaseClient();

onMounted(async () => {
  const { error } = await supabase.auth.exchangeCodeForSession(window.location.search);
  if (error) {
    await navigateTo('/sign-in');
    return;
  }

  await $fetch('/api/me/profile', {
    method: 'PATCH',
    body: { locale: normalizeLocale(navigator.language) },
  }).catch(() => {});

  await navigateTo('/dashboard');
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <p class="text-muted">
      Signing in...
    </p>
  </div>
</template>
