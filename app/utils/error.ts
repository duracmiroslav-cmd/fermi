// Extracts the most useful human-readable string from any thrown
// value. Order of preference:
//
//   1. `data.statusMessage` — Nuxt server's `createError({ statusMessage })`
//      payload, carries our intentional UI copy.
//   2. `data.message` — same payload, fallback when handlers mis-set fields.
//   3. `Error.message` — generic Error / FetchError framing
//      (e.g. "[POST] /api/x: 500 Server Error"). Last resort.
//   4. 'Unknown error' — non-Error thrown.
//
// Used by every dashboard toast so server-side `statusMessage` wins
// over the FetchError's auto-generated "[METHOD] URL: STATUS" string.
export const extractErrorMessage = (e: unknown): string => {
  const data = (e as { data?: { statusMessage?: string; message?: string } })?.data;
  if (data?.statusMessage) return data.statusMessage;
  if (data?.message) return data.message;
  if (e instanceof Error) return e.message;
  return 'Unknown error';
};
