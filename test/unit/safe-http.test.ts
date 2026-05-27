import { describe, expect, it } from 'vitest';
import { isBlockedLiteralHost, isPrivateIpv4, isPrivateIpv6 } from '../../supabase/functions/agent/tools/safe-http';

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
