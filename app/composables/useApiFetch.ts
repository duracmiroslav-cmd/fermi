// Wraps useLazyFetch with cookie headers for SSR auth. Use this for every
// internal /api/* call from pages/components, bare useLazyFetch loses the
// auth context during server render and quietly returns 401.
export const useApiFetch = <T>(url: string | (() => string)) =>
  useLazyFetch<T>(url, { headers: useRequestHeaders(['cookie']) });
