// Extracts the most useful human-readable string from any thrown
// value. Order of preference:
//
//   1. `data.code` — Nuxt server's `createError({ data: { code } })`
//      payload. Code IS the i18n key (e.g. `__errorBotNotFound`);
//      caller passes `t` and we look it up. Falls through if `t` is
//      missing or the key has no translation.
//   2. `data.statusMessage` — `createError({ statusMessage })`,
//      carries the English fallback from server.
//   3. `data.message` — same payload, alternate shape.
//   4. `Error.message` — generic Error / FetchError framing
//      (e.g. "[POST] /api/x: 500 Server Error"). Last resort.
//   5. `t('__errorUnknown')` if `t` available, else 'Unknown error'.
//
// Used by every dashboard toast so server-side `code` wins over the
// FetchError's auto-generated "[METHOD] URL: STATUS" string.
export const extractErrorMessage = (
  e: unknown,
  t?: (key: string) => string,
): string => {
  const data = (e as { data?: { code?: string; statusMessage?: string; message?: string } })?.data;
  if (data?.code && t) {
    const translated = t(data.code);
    // vue-i18n returns the key itself when no translation exists;
    // treat that as a miss and fall through to statusMessage.
    if (translated !== data.code) return translated;
  }
  if (data?.statusMessage) return data.statusMessage;
  if (data?.message) return data.message;
  if (e instanceof Error) return e.message;
  return t ? t('__errorUnknown') : 'Unknown error';
};
