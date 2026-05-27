import { describe, expect, it } from 'vitest';
import { isTrustedTriggerHost } from '../../server/utils/trigger';

describe('isTrustedTriggerHost', () => {
  it.each([
    ['https://myproj.supabase.co/functions/v1/agent', 'project subdomain over https'],
    ['http://localhost/functions/v1/agent', 'localhost dev'],
    ['http://127.0.0.1:54321/functions/v1/agent', 'loopback dev'],
  ])('trusts %s (%s)', (url) => {
    expect(isTrustedTriggerHost(new URL(url))).toBe(true);
  });

  it.each([
    ['http://myproj.supabase.co/functions/v1/agent', 'http downgrade on supabase.co'],
    ['https://myproj.supabase.co.attacker.com/x', 'suffix-append spoof'],
    ['https://notsupabase.co/x', 'missing dot boundary'],
    ['https://supabase.co/x', 'apex without subdomain'],
    ['https://attacker.com/x', 'unrelated host'],
  ])('refuses %s (%s)', (url) => {
    expect(isTrustedTriggerHost(new URL(url))).toBe(false);
  });
});
