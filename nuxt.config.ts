// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxt/ui',
    '@nuxtjs/i18n',
    '@nuxtjs/supabase',
    '@sentry/nuxt/module',
    '@vueuse/nuxt',
  ],
  i18n: {
    defaultLocale:         'en',
    strategy:              'no_prefix',
    detectBrowserLanguage: false,
    locales:               [
      { code: 'en', name: 'English', file: 'en.json' },
    ],
  },
  colorMode: {
    preference: 'dark',
    fallback:   'dark',
  },
  fonts: {
    families: [
      { name: 'Inter', provider: 'google' },
      { name: 'JetBrains Mono', provider: 'google' },
    ],
  },
  runtimeConfig: {
    fermiKek:               process.env.FERMI_KEK ?? '',
    supabaseUrl:            process.env.SUPABASE_URL ?? '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    // Counter backend. Both blank → Postgres fallback; both set →
    // Upstash REST. Read in webhook handler / quota call sites and
    // forwarded into the counter factory.
    upstashUrl:             process.env.UPSTASH_REDIS_REST_URL ?? '',
    upstashToken:           process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
    // Platform OpenAI key for dashboard TTS preview when the owner
    // hasn't connected their own OpenAI BYOK yet. Worker (Edge Fn)
    // reads its own copy via Deno.env; this entry is server-only.
    openaiApiKey:           process.env.OPENAI_API_KEY ?? '',
    // Public-facing origin fermi serves under. Used to build webhook
    // URLs we expose to LINE. Falls back to the request origin when
    // unset (fine for prod via real domain; required when dev'ing
    // through ngrok and accessing fermi from localhost).
    appUrl:                 process.env.NUXT_APP_URL ?? '',
    public:                 {
      googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
      sentry:         {
        // DSN flows through runtimeConfig so Sentry's init files can read
        // it via `useRuntimeConfig()` instead of `process.env.*`. Vite's
        // build-time `process.env` substitution doesn't always reach
        // config files outside `app/`; the runtimeConfig path is the
        // documented way and works in both client + server bundles.
        dsn: process.env.NUXT_PUBLIC_SENTRY_DSN ?? '',
      },
    },
  },
  supabase: {
    redirectOptions: {
      login:    '/sign-in',
      callback: '/confirm',
      exclude:  ['/'],
    },
  },
  css:               ['~/assets/css/main.css'],
  devtools:          { enabled: true },
  compatibilityDate: '2025-07-15',
  vite:              {
    server: {
      allowedHosts: ['.ngrok-free.app'],
    },
  },
  eslint: {
    config: {
      typescript: true,
    },
  },
  typescript: {
    tsConfig: {
      compilerOptions: {
        allowImportingTsExtensions: true,
      },
    },
    sharedTsConfig: {
      compilerOptions: {
        allowImportingTsExtensions: true,
      },
    },
    nodeTsConfig: {
      compilerOptions: {
        allowImportingTsExtensions: true,
      },
    },
  },
  nitro: {
    typescript: {
      tsConfig: {
        compilerOptions: {
          allowImportingTsExtensions: true,
        },
      },
    },
  },
});
