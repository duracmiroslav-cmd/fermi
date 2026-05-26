// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/fonts', '@nuxt/ui', '@nuxtjs/supabase', '@vueuse/nuxt'],
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },
  fonts: {
    families: [
      { name: 'Inter', provider: 'google' },
      { name: 'JetBrains Mono', provider: 'google' },
    ],
  },
  runtimeConfig: {
    fermiKek: process.env.FERMI_KEK ?? '',
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    // Public-facing origin fermi serves under. Used to build webhook
    // URLs we expose to LINE. Falls back to the request origin when
    // unset (fine for prod via real domain; required when dev'ing
    // through ngrok and accessing fermi from localhost).
    appUrl: process.env.NUXT_APP_URL ?? '',
    public: {
      googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    },
  },
  supabase: {
    redirectOptions: {
      login: '/sign-in',
      callback: '/confirm',
      exclude: ['/'],
    },
  },
  css: ['~/assets/css/main.css'],
  devtools: { enabled: true },
  compatibilityDate: '2025-07-15',
  vite: {
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
