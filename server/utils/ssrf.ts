// Node-side SSRF guard for the BYO MCP connect endpoint. That endpoint's
// `initialize` probe fetches a USER-supplied URL from the Nitro server, so
// the URL must be validated before the probe goes out — otherwise the probe
// is itself the SSRF vector (unlike github / twinkle, whose probe URLs are
// hardcoded). Shares the private-address policy with the Deno worker via
// shared/ssrf.ts; resolution here is node:dns. Fails closed.

import { resolve4, resolve6 } from 'node:dns/promises';
import { isBlockedLiteralHost, isPrivateIpv4, isPrivateIpv6 } from '~~/shared/ssrf';

export const assertPublicUrl = async (rawUrl: string): Promise<URL> => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid URL' });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw createError({ statusCode: 400, statusMessage: 'URL must use http or https' });
  }

  const host = url.hostname;
  if (isBlockedLiteralHost(host)) {
    throw createError({ statusCode: 400, statusMessage: 'URL host is not allowed' });
  }

  const [v4, v6] = await Promise.allSettled([resolve4(host), resolve6(host)]);
  const v4Ips = v4.status === 'fulfilled' ? v4.value : [];
  const v6Ips = v6.status === 'fulfilled' ? v6.value : [];
  if (v4Ips.length === 0 && v6Ips.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'URL host did not resolve' });
  }
  if (v4Ips.some(isPrivateIpv4) || v6Ips.some(isPrivateIpv6)) {
    throw createError({ statusCode: 400, statusMessage: 'URL host resolves to a private address' });
  }

  return url;
};
