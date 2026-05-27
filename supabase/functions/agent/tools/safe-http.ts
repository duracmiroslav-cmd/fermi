// DNS-pinned HTTP/1.1 client. Built on Deno.connect / connectTls so we
// control the connection target IP directly instead of letting `fetch`
// re-resolve the hostname under the hood. This closes the DNS-rebinding
// window: validate the hostname's A + AAAA records, pick a public IP,
// open the socket to that IP, and (for TLS) pass the original hostname
// as `serverName` so cert validation still works.
//
// Scope is deliberately narrow: GET only, no compression, no HTTP/2, no
// keep-alive, no cookies. fermi only needs to read a single page body
// safely. Anything beyond that goes via Tavily (the preferred provider).

export const isPrivateIpv4 = (ip: string): boolean => {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
};

// IPv6 private / loopback / link-local / ULA / mapped IPv4. Done on the
// already-resolved address string (lowercased, no zone suffix), so the
// prefix-based test covers the canonical normalized forms returned by
// Deno.resolveDns.
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

// Resolves A + AAAA together. Fails closed: any private address in the
// returned set blocks the host, an empty result blocks the host. The
// returned IP is what the socket will connect to; serverName for TLS
// is set separately to the original hostname so the cert chain still
// validates against the public name.
interface ResolvedTarget {
  ip:     string;
  family: 4 | 6;
}

const resolveAndValidate = async (host: string): Promise<ResolvedTarget> => {
  if (isBlockedLiteralHost(host)) throw new Error(`Blocked host: ${host}`);
  const [v4, v6] = await Promise.allSettled([
    Deno.resolveDns(host, 'A'),
    Deno.resolveDns(host, 'AAAA'),
  ]);
  const v4Ips = v4.status === 'fulfilled' ? v4.value : [];
  const v6Ips = v6.status === 'fulfilled' ? v6.value : [];
  if (v4Ips.length === 0 && v6Ips.length === 0) {
    throw new Error(`DNS resolution failed for ${host}`);
  }
  if (v4Ips.some(isPrivateIpv4)) throw new Error(`Host resolves to private IPv4: ${host}`);
  if (v6Ips.some(isPrivateIpv6)) throw new Error(`Host resolves to private IPv6: ${host}`);
  // Prefer IPv4 for compatibility; some Edge runtimes have spotty IPv6.
  if (v4Ips.length > 0) return { ip: v4Ips[0], family: 4 };
  return { ip: v6Ips[0], family: 6 };
};

const TEXT_DECODER = new TextDecoder('utf-8', { fatal: false });
const HEADER_DECODER = new TextDecoder('latin1');
const ENCODER = new TextEncoder();

const buildRequest = (input: {
  hostHeader: string;
  pathAndQuery: string;
  extraHeaders: Record<string, string>;
}): Uint8Array => {
  const lines = [
    `GET ${input.pathAndQuery} HTTP/1.1`,
    `Host: ${input.hostHeader}`,
    'Connection: close',
    'User-Agent: fermi-web-fetch/1.0',
    'Accept: text/html, application/json, text/plain, application/xml, text/xml, */*;q=0.1',
    // No Accept-Encoding on purpose: skipping compression keeps the
    // parser minimal and most servers fall back to identity transfer.
    ...Object.entries(input.extraHeaders).map(([k, v]) => `${k}: ${v}`),
    '',
    '',
  ];
  return ENCODER.encode(lines.join('\r\n'));
};

const readAllCapped = async (
  conn:       Deno.Conn,
  maxBytes:   number,
  timeoutMs:  number,
): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const buf = new Uint8Array(8192);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (Date.now() > deadline) throw new Error('Read timeout');
    let n: number | null;
    try {
      n = await conn.read(buf);
    } catch (err) {
      // rustls strict mode flags a missing TLS close_notify as a fatal
      // error. Many TLS servers in the wild (Google, some CDN edge
      // configs) close the socket without sending it. Browsers and
      // curl both tolerate this, so we mirror that behavior: treat
      // missing close_notify as end-of-stream once we've already read
      // bytes, but surface it as an error on a totally empty response
      // since that signals a real handshake failure.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('close_notify') && total > 0) break;
      throw err;
    }
    if (n === null) break;
    if (total + n > maxBytes) {
      chunks.push(buf.slice(0, maxBytes - total));
      total = maxBytes;
      break;
    }
    chunks.push(buf.slice(0, n));
    total += n;
  }
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.byteLength; }
  return merged;
};

interface ParsedResponse {
  status:  number;
  headers: Record<string, string>;
  body:    Uint8Array;
}

const findHeaderTerminator = (buf: Uint8Array): number => {
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) {
      return i;
    }
  }
  return -1;
};

const parseResponse = (raw: Uint8Array): ParsedResponse => {
  const end = findHeaderTerminator(raw);
  if (end === -1) throw new Error('Malformed HTTP response: no header terminator');

  const headText = HEADER_DECODER.decode(raw.slice(0, end));
  const body     = raw.slice(end + 4);

  const lines = headText.split('\r\n');
  const status = Number(lines[0].match(/^HTTP\/1\.[01] (\d{3})/)?.[1] ?? NaN);
  if (Number.isNaN(status)) throw new Error(`Bad status line: ${lines[0]}`);

  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const idx = lines[i].indexOf(':');
    if (idx < 1) continue;
    headers[lines[i].slice(0, idx).trim().toLowerCase()] = lines[i].slice(idx + 1).trim();
  }
  return { status, headers, body };
};

// chunked = (<hex size>[;ext]\r\n<bytes>\r\n)+ then "0\r\n\r\n". The
// real spec also allows trailers; fermi doesn't read them. Stops at
// the first 0-size chunk.
const decodeChunkedBody = (body: Uint8Array): Uint8Array => {
  const out: number[] = [];
  let pos = 0;
  while (pos < body.length) {
    let lineEnd = pos;
    while (lineEnd + 1 < body.length && !(body[lineEnd] === 13 && body[lineEnd + 1] === 10)) {
      lineEnd++;
    }
    if (lineEnd + 1 >= body.length) break;
    const sizeStr = HEADER_DECODER.decode(body.slice(pos, lineEnd)).split(';')[0].trim();
    const size = parseInt(sizeStr, 16);
    if (Number.isNaN(size)) throw new Error(`Bad chunk size: ${sizeStr}`);
    pos = lineEnd + 2;
    if (size === 0) break;
    if (pos + size > body.length) throw new Error('Truncated chunk');
    for (let i = 0; i < size; i++) out.push(body[pos + i]);
    pos += size + 2;
  }
  return new Uint8Array(out);
};

export interface SafeFetchOptions {
  maxBytes:     number;
  timeoutMs:    number;
  maxRedirects: number;
}

export interface SafeFetchResult {
  status:      number;
  contentType: string;
  body:        string;
  finalUrl:    string;
}

export const safeFetch = async (
  rawUrl:  string,
  options: SafeFetchOptions,
): Promise<SafeFetchResult> => {
  let currentUrl = new URL(rawUrl);

  for (let hop = 0; hop <= options.maxRedirects; hop++) {
    if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
      throw new Error(`Unsupported protocol: ${currentUrl.protocol}`);
    }

    const host = currentUrl.hostname;
    const target = await resolveAndValidate(host);

    const port = currentUrl.port
      ? Number(currentUrl.port)
      : (currentUrl.protocol === 'https:' ? 443 : 80);

    // The load-bearing pair: open the TCP socket to the validated IP,
    // then upgrade via startTls passing the original hostname so both
    // SNI and cert chain validation bind to the public name. Deno's
    // connectTls would instead validate the cert against the literal
    // IP we connected to, which the cert chain can't match. startTls
    // separates "what to dial" from "what name to verify", giving
    // true DNS pinning on HTTPS — any DNS change between our resolve
    // and the connect has no effect, the bytes are already going to
    // a pre-vetted address.
    let conn: Deno.Conn;
    const tcp = await Deno.connect({ hostname: target.ip, port });
    if (currentUrl.protocol === 'https:') {
      conn = await Deno.startTls(tcp, {
        hostname:      host,
        alpnProtocols: ['http/1.1'],
      });
    } else {
      conn = tcp;
    }

    try {
      const pathAndQuery = (currentUrl.pathname || '/') + currentUrl.search;
      const req = buildRequest({
        hostHeader:   currentUrl.host,
        pathAndQuery,
        extraHeaders: {},
      });
      await conn.write(req);

      const raw = await readAllCapped(conn, options.maxBytes, options.timeoutMs);
      const { status, headers, body: rawBody } = parseResponse(raw);

      if (status >= 300 && status < 400) {
        const loc = headers['location'];
        if (!loc) throw new Error(`Redirect ${status} without Location header`);
        currentUrl = new URL(loc, currentUrl);
        continue;
      }

      const transferEncoding = headers['transfer-encoding']?.toLowerCase() ?? '';
      const decoded = transferEncoding.includes('chunked')
        ? decodeChunkedBody(rawBody)
        : rawBody;

      return {
        status,
        contentType: headers['content-type'] ?? '',
        body:        TEXT_DECODER.decode(decoded),
        finalUrl:    currentUrl.toString(),
      };
    } finally {
      try { conn.close(); } catch { /* already closed */ }
    }
  }

  throw new Error('Too many redirects');
};
