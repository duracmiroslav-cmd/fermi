import * as Sentry from '@sentry/nuxt';

// Browser-side Sentry init. The Nuxt module loads this file early so unhandled
// errors and Vue lifecycle exceptions are captured even before the app is
// fully hydrated.
//
// DSN comes from `runtimeConfig.public.sentry.dsn` (wired in nuxt.config.ts
// from the `NUXT_PUBLIC_SENTRY_DSN` env var). Going through runtimeConfig is
// the documented Nuxt path — direct `process.env.*` reads aren't reliably
// inlined for files outside `app/`.
//
// When DSN is empty (local dev without it set), `Sentry.init` quietly no-ops.
const config = useRuntimeConfig();

Sentry.init({
  dsn:              config.public.sentry?.dsn,
  // No performance tracing in v1 — the free tier's performance quota is
  // smaller than error quota, and we don't have a baseline to interpret
  // traces yet.
  tracesSampleRate: 0,
  beforeSend(event) {
    return scrubEvent(event);
  },
});

// Conservative PII scrubbing: drop the request body, sensitive headers, and
// any user identifier we may have attached in error context. The codebase
// doesn't deliberately ship user message content into Sentry context, but
// stripping at the SDK boundary makes accidental leaks impossible.
const scrubEvent = (event: Sentry.ErrorEvent): Sentry.ErrorEvent | null => {
  if (event.request) {
    delete event.request.data;
    if (event.request.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
      delete event.request.headers['x-line-signature'];
    }
  }
  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
  }
  return event;
};
