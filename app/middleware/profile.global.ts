import { normalizeLocale } from '~~/shared/locale';

export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/dashboard')) return;

  const profile = useProfile();
  if (profile.value) return;

  const { data } = await useFetch<Profile>('/api/me/profile', {
    headers: useRequestHeaders(['cookie']),
  });
  profile.value = data.value ?? null;

  // A logged-in user's saved locale is the cross-device source of truth, so it
  // overrides browser/cookie detection. Runs SSR-side (the fetch carries the
  // cookie), so first paint is correct; setLocale also re-syncs the cookie.
  const saved = profile.value?.locale;
  if (saved) {
    const { $i18n } = useNuxtApp();
    const code = normalizeLocale(saved);
    if (code !== $i18n.locale.value) await $i18n.setLocale(code);
  }
});
