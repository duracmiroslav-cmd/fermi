// SSRF address policy: which resolved IPs / literal hosts count as
// private and must never be dialed. Pure (no DNS, no runtime globals) so
// both the Deno worker (safe-http.ts, DNS-pinned transport) and the Nitro
// server (server/utils/ssrf.ts, node:dns) share one definition of "private".
// The resolver differs per runtime; this policy does not.

export const isPrivateIpv4 = (ip: string): boolean => {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
};

// IPv6 private / loopback / link-local / ULA / mapped IPv4. Done on the
// already-resolved address string (lowercased, no zone suffix), so the
// prefix-based test covers the canonical normalized forms returned by DNS
// resolution.
export const isPrivateIpv6 = (raw: string): boolean => {
  const ip = raw.toLowerCase().replace(/%.*$/, '');
  if (ip === '::' || ip === '::1') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
  if (ip.startsWith('fe80:') || ip.startsWith('fe80::')) return true;
  if (ip.startsWith('2001:db8:')) return true;
  if (ip.startsWith('::ffff:')) return isPrivateIpv4(ip.slice('::ffff:'.length));
  return false;
};

export const isBlockedLiteralHost = (host: string): boolean => {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === 'metadata.google.internal') return true;
  if (h.includes(':')) return isPrivateIpv6(h);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return isPrivateIpv4(h);
  return false;
};
