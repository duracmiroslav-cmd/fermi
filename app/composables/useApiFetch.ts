// Wraps useLazyFetch with cookie headers for SSR auth. Use this for every
// internal /api/* call from pages/components, bare useLazyFetch loses the
// auth context during server render and quietly returns 401.
//
// Pass `key` so another page can invalidate this cache via
// `refreshNuxtData('agent-${id}')` after a PATCH, keeping the detail
// page fresh on next navigation.
export const useApiFetch = <T>(
  url: string | (() => string),
  options?: Parameters<typeof useLazyFetch<T>>[1],
) => useLazyFetch<T>(url, {
  headers: useRequestHeaders(['cookie']),
  ...options,
});
