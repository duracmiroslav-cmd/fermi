import * as Sentry from '@sentry/nuxt';

// Nitro-side Sentry init. Captures unhandled exceptions thrown by API route
// handlers and the Nitro runtime itself. Same scrubbing rules as the client
// config since `request.body` here is the actual server-received payload
// (including LINE webhook bodies, BYOK token POSTs).
const config = useRuntimeConfig();

Sentry.init({
  dsn:              config.public.sentry?.dsn,
  tracesSampleRate: 0,
  beforeSend(event) {
    return scrubEvent(event);
  },
});

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
