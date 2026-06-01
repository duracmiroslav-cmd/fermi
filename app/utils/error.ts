// Server `data.code` is the i18n key; falls through to statusMessage /
// Error.message for non-fermi errors (native fetch, generic JS Error).
export const extractErrorMessage = (
  e: unknown,
  t?: (key: string) => string,
): string => {
  const data = (e as { data?: { code?: string; statusMessage?: string; message?: string } })?.data;
  if (data?.code && t) {
    const translated = t(data.code);
    // vue-i18n returns the key itself on miss.
    if (translated !== data.code) return translated;
  }
  if (data?.statusMessage) return data.statusMessage;
  if (data?.message) return data.message;
  if (e instanceof Error) return e.message;
  return t ? t('__errorUnknown') : 'Unknown error';
};
