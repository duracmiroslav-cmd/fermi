// Hostname must match this for fermi to forward the service-role
// bearer to /functions/v1/agent. A misconfigured SUPABASE_URL would
// otherwise leak the bearer to whatever host it resolves to.
export const isTrustedTriggerHost = (url: URL): boolean =>
  (url.protocol === 'https:' && url.hostname.endsWith('.supabase.co'))
  || url.hostname === 'localhost'
  || url.hostname === '127.0.0.1';
