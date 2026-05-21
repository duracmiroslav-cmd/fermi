// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],
  compatibilityDate: '2025-07-15',
  devtools: {
    enabled: true,
  },
  eslint: {
    config: {
      typescript: true,
    },
  },
});
