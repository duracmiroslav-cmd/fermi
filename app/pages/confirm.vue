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

  // Seed locale + timezone from the browser only on first login (when unset).
  // A later manual change in settings is then the durable source of truth,
  // not clobbered on every sign-in.
  try {
    const profile = await $fetch<Profile>('/api/me/profile');
    const patch: Record<string, string> = {};
    if (!profile.locale) patch.locale = normalizeLocale(navigator.language);
    if (!profile.timezone) patch.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (Object.keys(patch).length > 0) {
      await $fetch('/api/me/profile', { method: 'PATCH', body: patch });
    }
  } catch (err) {
    console.warn('preference seed failed', err);
  }

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
