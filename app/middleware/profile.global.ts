export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/dashboard')) return;

  const profile = useProfile();
  if (profile.value) return;

  const { data } = await useFetch<Profile>('/api/me/profile', {
    headers: useRequestHeaders(['cookie']),
  });
  profile.value = data.value;
});
