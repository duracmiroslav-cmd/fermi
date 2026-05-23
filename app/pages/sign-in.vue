<script setup lang="ts">
import type { CredentialResponse, accounts } from 'google-one-tap';
import { normalizeLocale } from '~~/shared/locale';

definePageMeta({ auth: false });

useSeoMeta({
  title: 'Sign in · fermi',
});

useHead({
  script: [{ src: 'https://accounts.google.com/gsi/client', async: true }],
});

declare const google: { accounts: accounts };

const config = useRuntimeConfig();
const supabase = useSupabaseClient();
const errorMessage = ref<string | null>(null);

const generateNonce = async (): Promise<[string, string]> => {
  const rawNonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawNonce));
  const hashedNonce = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  return [rawNonce, hashedNonce];
};

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await navigateTo('/dashboard');
    return;
  }

  await until(() => !!window.google).toBeTruthy({ timeout: 5000 });

  const [rawNonce, hashedNonce] = await generateNonce();

  google.accounts.id.initialize({
    client_id: config.public.googleClientId,
    nonce: hashedNonce,
    use_fedcm_for_prompt: true,
    callback: async (response: CredentialResponse) => {
      try {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: response.credential,
          nonce: rawNonce,
        });
        if (error) throw error;

        // Best-effort locale sync; session is valid even if PATCH fails.
        const oauthLocale = data.user?.user_metadata?.locale as string | undefined;
        await $fetch('/api/me/profile', {
          method: 'PATCH',
          body: { locale: normalizeLocale(oauthLocale) },
        }).catch(() => {});

        await navigateTo('/dashboard');
      } catch (e) {
        errorMessage.value = e instanceof Error ? e.message : 'Sign-in failed';
      }
    },
  });

  const btn = document.getElementById('google-btn');
  if (btn) {
    google.accounts.id.renderButton(btn, {
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      width: 280,
    });
  }

  google.accounts.id.prompt();
});
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
    <div class="text-center">
      <h1 class="text-2xl font-bold">
        fermi
      </h1>
      <p class="text-sm text-muted mt-1">
        LINE 上的 agentic assistant
      </p>
    </div>

    <div id="google-btn" />

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :description="errorMessage"
      class="max-w-sm w-full"
    />
  </div>
</template>
