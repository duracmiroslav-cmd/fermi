<script setup lang="ts">
definePageMeta({ auth: false });

const { t } = useI18n();

useSeoMeta({
  title:       t('__titleSeoLanding'),
  description: t('__descriptionSeoLanding'),
});

const user = useSupabaseUser();

const email = ref('');
const submitting = ref(false);
const submitted = ref(false);
const errorMessage = ref<string | null>(null);

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const submit = async () => {
  errorMessage.value = null;
  if (!isValidEmail(email.value)) {
    errorMessage.value = t('__errorInvalidEmail');
    return;
  }
  submitting.value = true;
  await new Promise(resolve => setTimeout(resolve, 600));
  submitted.value = true;
  submitting.value = false;
};
</script>

<template>
  <div class="relative min-h-screen w-screen overflow-hidden">
    <div class="grid-bg pointer-events-none absolute inset-0" />
    <div class="glow pointer-events-none absolute -top-32 -right-32" />
    <div class="glow-secondary pointer-events-none absolute bottom-0 right-1/4" />

    <aside class="pointer-events-none absolute top-32 right-6 sm:right-12 hidden md:block font-mono text-right select-none">
      <p class="text-xs text-toned/70 leading-relaxed">
        <span class="block">{{ $t('__descriptionFermiQuote') }}</span>
        <span class="block text-toned/50 mt-1">{{ $t('__descriptionFermiQuoteAttribution') }}</span>
      </p>
      <p class="mt-6 text-xs text-toned/70">
        <span class="text-primary/80">∴</span> {{ $t('__descriptionFermiQuoteAnswer') }}
      </p>
    </aside>

    <div class="relative flex flex-col min-h-screen">
      <header class="flex items-center justify-between px-6 sm:px-12 py-6">
        <div class="flex items-baseline gap-3">
          <span class="font-mono text-base text-highlighted tracking-tight">fermi</span>
          <span class="font-mono text-xs text-toned">v0.1-beta</span>
        </div>
        <nav class="flex items-center gap-6 font-mono text-xs">
          <a
            href="https://github.com/ipotesi/fermi"
            target="_blank"
            rel="noopener"
            class="text-toned hover:text-highlighted transition-colors flex items-center gap-1.5"
          >
            github
            <span aria-hidden="true">↗</span>
          </a>
          <NuxtLink
            :to="user ? '/dashboard' : '/sign-in'"
            class="text-toned hover:text-highlighted transition-colors flex items-center gap-1.5"
          >
            {{ user ? $t('__actionOpenDashboard') : $t('__actionSignIn') }}
            <span
              v-if="user"
              aria-hidden="true"
            >↗</span>
          </NuxtLink>
        </nav>
      </header>

      <main class="flex-1 flex items-center px-6 sm:px-12 py-12 sm:py-20">
        <div class="w-full max-w-3xl">
          <div class="flex items-center gap-2 mb-8 font-mono text-xs">
            <span class="relative inline-flex w-1.5 h-1.5">
              <span class="absolute inset-0 rounded-full bg-primary animate-ping-slow" />
              <span class="relative inline-block w-1.5 h-1.5 rounded-full bg-primary" />
            </span>
            <span class="text-toned uppercase tracking-wider">{{ $t('__hintClosedBeta') }}</span>
          </div>

          <h1 class="font-mono text-highlighted text-3xl sm:text-5xl md:text-6xl leading-none tracking-tight font-medium">
            <span
              class="block reveal"
              style="animation-delay: 60ms"
            >{{ $t('__titleHeroLine1') }}</span>
            <span
              class="block reveal mt-2 sm:mt-3"
              style="animation-delay: 180ms"
            >{{ $t('__titleHeroLine2') }}</span>
            <span
              class="block reveal mt-2 sm:mt-3"
              style="animation-delay: 300ms"
            >
              {{ $t('__titleHeroLine3') }}<span class="text-primary">.</span>
            </span>
          </h1>

          <p
            class="mt-10 text-toned text-base sm:text-lg max-w-xl leading-relaxed reveal"
            style="animation-delay: 520ms"
          >
            {{ $t('__descriptionHeroSubline') }}
          </p>

          <form
            class="mt-10 max-w-md reveal"
            style="animation-delay: 680ms"
            @submit.prevent="submit"
          >
            <I18nT
              v-if="submitted"
              keypath="__descriptionWaitlistJoined"
              tag="div"
              class="rounded-lg border border-default bg-muted/50 px-4 py-3 font-mono text-sm text-highlighted flex items-center gap-2"
            >
              <template #email>
                <span class="text-toned">{{ email }}</span>
              </template>
            </I18nT>

            <template v-else>
              <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <UInput
                  v-model.trim="email"
                  type="email"
                  placeholder="you@somewhere.com"
                  size="lg"
                  autocomplete="email"
                  :disabled="submitting"
                  class="flex-1"
                />
                <UButton
                  type="submit"
                  size="lg"
                  :loading="submitting"
                  trailing-icon="i-lucide-arrow-right"
                  class="font-mono justify-center"
                >
                  {{ $t('__actionJoinWaitlist') }}
                </UButton>
              </div>
              <p
                v-if="errorMessage"
                class="mt-2 font-mono text-xs text-error"
              >
                ! {{ errorMessage }}
              </p>
              <p
                v-else
                class="mt-3 font-mono text-xs text-toned"
              >
                {{ $t('__hintWaitlistNoSpam') }}
              </p>
            </template>
          </form>
        </div>
      </main>

      <section class="border-t border-default px-6 sm:px-12 py-10">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-6 max-w-3xl font-mono">
          <div class="flex flex-col gap-1.5">
            <span class="text-2xl sm:text-3xl text-highlighted tracking-tight">
              t ≈ <span class="text-primary">5</span><span class="text-toned text-base"> min</span>
            </span>
            <span class="text-xs text-toned uppercase tracking-wider">{{ $t('__labelOnboarding') }}</span>
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-2xl sm:text-3xl text-highlighted tracking-tight">
              n = <span class="text-primary">10<sup class="text-lg">2</sup></span><span class="text-toned text-base"> MCPs</span>
            </span>
            <span class="text-xs text-toned uppercase tracking-wider">{{ $t('__labelEcosystem') }}</span>
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-2xl sm:text-3xl text-highlighted tracking-tight">
              d = <span class="text-primary">0</span><span class="text-toned text-base"> deploys</span>
            </span>
            <span class="text-xs text-toned uppercase tracking-wider">{{ $t('__labelInfrastructure') }}</span>
          </div>
        </div>
      </section>

      <footer class="px-6 sm:px-12 py-6 border-t border-default font-mono text-xs text-toned">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <span>{{ $t('__descriptionFooterCopyright') }}</span>
          <a
            href="https://github.com/ipotesi/fermi"
            target="_blank"
            rel="noopener"
            class="hover:text-highlighted transition-colors"
          >
            github ↗
          </a>
        </div>
      </footer>
    </div>
  </div>
</template>

<style>
html, body { overflow-x: hidden; max-width: 100vw; }
</style>

<style scoped>
.grid-bg {
  background-image: radial-gradient(circle at 1px 1px, var(--ui-border) 1px, transparent 0);
  background-size: 32px 32px;
  opacity: 0.35;
  mask-image: radial-gradient(ellipse 80% 70% at 20% 30%, black 20%, transparent 80%);
  -webkit-mask-image: radial-gradient(ellipse 80% 70% at 20% 30%, black 20%, transparent 80%);
}

.glow {
  width: 48rem;
  height: 48rem;
  background: radial-gradient(circle, var(--color-apricot-500) 0%, transparent 65%);
  filter: blur(80px);
  opacity: 0.32;
}

.glow-secondary {
  width: 28rem;
  height: 28rem;
  background: radial-gradient(circle, var(--color-apricot-700) 0%, transparent 65%);
  filter: blur(90px);
  opacity: 0.18;
}

.reveal {
  opacity: 0;
  transform: translateY(8px);
  animation: reveal 0.7s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}

@keyframes reveal {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes ping-slow {
  0% {
    transform: scale(1);
    opacity: 0.7;
  }
  75%, 100% {
    transform: scale(3);
    opacity: 0;
  }
}

.animate-ping-slow {
  animation: ping-slow 2.4s cubic-bezier(0, 0, 0.2, 1) infinite;
}

@media (prefers-reduced-motion: reduce) {
  .reveal {
    animation: none;
    opacity: 1;
    transform: none;
  }
  .animate-ping-slow {
    animation: none;
  }
}
</style>
