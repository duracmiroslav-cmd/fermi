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
const githubBusy = ref(false);

const signInWithGithub = async () => {
  githubBusy.value = true;
  errorMessage.value = null;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: `${window.location.origin}/confirm` },
  });
  if (error) {
    errorMessage.value = error.message;
    githubBusy.value = false;
  }
};

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
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: response.credential,
          nonce: rawNonce,
        });
        if (error) throw error;

        // Best-effort locale sync; session is valid even if PATCH fails.
        await $fetch('/api/me/profile', {
          method: 'PATCH',
          body: { locale: normalizeLocale(navigator.language) },
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

    <button
      type="button"
      :disabled="githubBusy"
      class="flex items-center justify-center gap-3 w-[280px] h-10 rounded-full bg-black text-white text-sm font-medium hover:bg-stone-900 transition-colors disabled:opacity-60 cursor-pointer"
      @click="signInWithGithub"
    >
      <svg
        viewBox="0 0 24 24"
        class="w-5 h-5"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
      Sign in with GitHub
    </button>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      :description="errorMessage"
      class="max-w-sm w-full"
    />
  </div>
</template>
