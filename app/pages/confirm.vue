<script setup lang="ts">
import { normalizeLocale } from '~~/shared/locale';

const supabase = useSupabaseClient();

onMounted(async () => {
  // No-op when Supabase already handled the OAuth callback server-side;
  // still needed for PKCE / magic-link flows where the client must finish
  // the exchange. Either way, the session check below is the source of truth.
  await supabase.auth.exchangeCodeForSession(window.location.search).catch(() => {});

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    await navigateTo('/sign-in');
    return;
  }

  await $fetch('/api/me/profile', {
    method: 'PATCH',
    body:   { locale: normalizeLocale(navigator.language) },
  }).catch(err => console.warn('locale sync failed', err));

  await navigateTo('/dashboard');
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <p class="text-toned">
      {{ $t('__hintSigningIn') }}
    </p>
  </div>
</template>
