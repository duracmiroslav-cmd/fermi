import { describe, expect, it } from 'vitest';
import { isBlockedLiteralHost, isPrivateIpv4, isPrivateIpv6 } from '../../shared/ssrf';
import { type DnsResolver, decodeChunkedBody, parseResponse, resolveAndValidate, safeFetch } from '../../supabase/functions/agent/tools/safe-http';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

const fakeResolver = (records: { A?: string[]; AAAA?: string[] }): DnsResolver =>
  (_host, type) => Promise.resolve(records[type] ?? []);

describe('isBlockedLiteralHost', () => {
  it.each([
    ['127.0.0.1', 'IPv4 loopback'],
    ['10.0.0.1', 'RFC1918 10/8'],
    ['172.16.0.1', 'RFC1918 172.16/12'],
    ['192.168.1.1', 'RFC1918 192.168/16'],
    ['100.64.0.1', 'CGNAT 100.64/10'],
    ['169.254.169.254', 'cloud metadata IP'],
    ['0.0.0.0', 'unspecified'],
    ['localhost', 'localhost name'],
    ['app.localhost', 'localhost subdomain'],
    ['printer.local', 'mDNS .local'],
    ['db.internal', '.internal suffix'],
    ['metadata.google.internal', 'GCP metadata name'],
    ['LOCALHOST', 'case-insensitive'],
    ['[::1]', 'bracketed IPv6 loopback'],
    ['[::ffff:127.0.0.1]', 'bracketed IPv4-mapped loopback'],
  ])('blocks %s (%s)', (host) => {
    expect(isBlockedLiteralHost(host)).toBe(true);
  });

  it.each([
    ['example.com', 'public name'],
    ['8.8.8.8', 'public IPv4'],
    ['1.1.1.1', 'public IPv4'],
    ['172.32.0.1', 'just past 172.16-31 block'],
    ['100.128.0.1', 'just past CGNAT 100.64-127'],
    ['[2606:4700:4700::1111]', 'public IPv6'],
  ])('allows %s (%s)', (host) => {
    expect(isBlockedLiteralHost(host)).toBe(false);
  });
});

describe('isPrivateIpv4', () => {
  it.each([
    '10.0.0.1',
    '127.0.0.1',
    '169.254.0.1',
    '172.16.0.0',
    '172.31.255.255',
    '192.168.0.1',
    '100.64.0.0',
    '100.127.255.255',
    '0.0.0.0',
  ])('treats %s as private', (ip) => {
    expect(isPrivateIpv4(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '172.15.255.255',
    '172.32.0.0',
    '100.63.255.255',
    '100.128.0.0',
  ])('treats %s as public', (ip) => {
    expect(isPrivateIpv4(ip)).toBe(false);
  });

  it.each([
    '256.1.1.1',
    '127.0.0',
    'not-an-ip',
  ])('rejects malformed %s as non-private', (ip) => {
    expect(isPrivateIpv4(ip)).toBe(false);
  });
});

describe('isPrivateIpv6', () => {
  it.each([
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
    'FE80::1',
  ])('treats %s as private', (ip) => {
    expect(isPrivateIpv6(ip)).toBe(true);
  });

  it.each([
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
  ])('treats %s as public', (ip) => {
    expect(isPrivateIpv6(ip)).toBe(false);
  });
});

describe('resolveAndValidate', () => {
  const neverResolver: DnsResolver = () => Promise.reject(new Error('resolver should not run'));

  it('blocks a literal private host before resolving', async () => {
    await expect(resolveAndValidate('127.0.0.1', neverResolver)).rejects.toThrow('Blocked host');
  });

  it('blocks a name that resolves to a private IPv4 (DNS rebinding)', async () => {
    const resolve = fakeResolver({ A: ['127.0.0.1'] });
    await expect(resolveAndValidate('evil.test', resolve)).rejects.toThrow('private IPv4');
  });

  it('blocks a name that resolves to a private IPv6', async () => {
    const resolve = fakeResolver({ AAAA: ['::1'] });
    await expect(resolveAndValidate('evil.test', resolve)).rejects.toThrow('private IPv6');
  });

  it('fails closed when any resolved address is private', async () => {
    const resolve = fakeResolver({ A: ['93.184.216.34', '10.0.0.1'] });
    await expect(resolveAndValidate('mixed.test', resolve)).rejects.toThrow('private IPv4');
  });

  it('blocks when DNS returns nothing', async () => {
    const resolve = fakeResolver({});
    await expect(resolveAndValidate('nx.test', resolve)).rejects.toThrow('DNS resolution failed');
  });

  it('returns a public IPv4 target', async () => {
    const resolve = fakeResolver({ A: ['93.184.216.34'] });
    await expect(resolveAndValidate('ok.test', resolve)).resolves.toEqual({ ip: '93.184.216.34', family: 4 });
  });

  it('prefers IPv4 when both families resolve publicly', async () => {
    const resolve = fakeResolver({ A: ['93.184.216.34'], AAAA: ['2606:2800:220:1:248:1893:25c8:1946'] });
    await expect(resolveAndValidate('dual.test', resolve)).resolves.toEqual({ ip: '93.184.216.34', family: 4 });
  });

  it('falls back to IPv6 when no A record exists', async () => {
    const resolve = fakeResolver({ AAAA: ['2606:2800:220:1:248:1893:25c8:1946'] });
    await expect(resolveAndValidate('v6.test', resolve)).resolves.toEqual({ ip: '2606:2800:220:1:248:1893:25c8:1946', family: 6 });
  });
});

describe('safeFetch (pre-connect guards)', () => {
  const opts = { maxBytes: 1000, timeoutMs: 1000, maxRedirects: 1 };

  it('rejects an unsupported scheme', async () => {
    await expect(safeFetch('ftp://example.com/', opts)).rejects.toThrow('Unsupported protocol');
  });

  it('routes the host through the block guard', async () => {
    await expect(safeFetch('http://127.0.0.1/', opts)).rejects.toThrow('Blocked host');
  });
});

describe('parseResponse', () => {
  it('parses status, headers, and body', () => {
    const r = parseResponse(enc('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\nhello'));
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('text/html');
    expect(dec(r.body)).toBe('hello');
  });

  it('lowercases header names and trims values', () => {
    const r = parseResponse(enc('HTTP/1.1 204 No Content\r\nX-Custom:   spaced  \r\n\r\n'));
    expect(r.headers['x-custom']).toBe('spaced');
  });

  it('throws when the header terminator is missing', () => {
    expect(() => parseResponse(enc('HTTP/1.1 200 OK\r\nContent-Type: text/html'))).toThrow('no header terminator');
  });

  it('throws on a malformed status line', () => {
    expect(() => parseResponse(enc('GARBAGE\r\n\r\n'))).toThrow('Bad status line');
  });
});

describe('decodeChunkedBody', () => {
  it('decodes a single chunk', () => {
    expect(dec(decodeChunkedBody(enc('5\r\nhello\r\n0\r\n\r\n')))).toBe('hello');
  });

  it('concatenates multiple chunks', () => {
    expect(dec(decodeChunkedBody(enc('5\r\nhello\r\n5\r\nworld\r\n0\r\n\r\n')))).toBe('helloworld');
  });

  it('ignores chunk extensions', () => {
    expect(dec(decodeChunkedBody(enc('5;name=value\r\nhello\r\n0\r\n\r\n')))).toBe('hello');
  });

  it('throws on a non-hex chunk size', () => {
    expect(() => decodeChunkedBody(enc('zz\r\nhello\r\n0\r\n\r\n'))).toThrow('Bad chunk size');
  });

  it('throws when a chunk is truncated', () => {
    expect(() => decodeChunkedBody(enc('5\r\nhi\r\n'))).toThrow('Truncated chunk');
  });
});
