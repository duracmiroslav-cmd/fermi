// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxtjs/supabase', '@vueuse/nuxt'],
  runtimeConfig: {
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    lineChannelSecret: process.env.LINE_CHANNEL_SECRET ?? '',
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
});
