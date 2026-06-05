import { describe, expect, it } from 'vitest';
import { capabilityNeedsConnection } from '../../shared/capabilities';

const tavily = { slug: 'tavily', displayName: 'Tavily', keyType: 'tavily', status: 'live' as const, platformBacked: true };
const github = { slug: 'github', displayName: 'GitHub', keyType: 'github', status: 'live' as const, platformBacked: false };

describe('capabilityNeedsConnection', () => {
  it('is false when the capability needs no provider credential', () => {
    expect(capabilityNeedsConnection({
      credentialType: 'none', tier: 'free', connectedKeyTypes: new Set(),
    })).toBe(false);
  });

  it('is true on Free when the provider key is not connected', () => {
    expect(capabilityNeedsConnection({
      credentialType: 'providers', providers: [tavily], tier: 'free', connectedKeyTypes: new Set(),
    })).toBe(true);
  });

  it('is false once the provider key is connected (any tier)', () => {
    expect(capabilityNeedsConnection({
      credentialType: 'providers', providers: [tavily], tier: 'free', connectedKeyTypes: new Set(['tavily']),
    })).toBe(false);
  });

  // Mirrors resolveKey: Pro is covered by fermi's platform key for a
  // platform-backed provider, so no personal connection is needed.
  it('is false on Pro for a platform-backed provider without a connected key', () => {
    expect(capabilityNeedsConnection({
      credentialType: 'providers', providers: [tavily], tier: 'pro', connectedKeyTypes: new Set(),
    })).toBe(false);
  });

  // OAuth providers have no platform fallback, so Pro still must connect.
  it('is true on Pro for an OAuth provider with no platform fallback', () => {
    expect(capabilityNeedsConnection({
      credentialType: 'providers', providers: [github], tier: 'pro', connectedKeyTypes: new Set(),
    })).toBe(true);
  });

  it('is false when the only provider is coming_soon', () => {
    expect(capabilityNeedsConnection({
      credentialType:    'providers',
      providers:         [{ ...tavily, status: 'coming_soon' }],
      tier:              'free',
      connectedKeyTypes: new Set(),
    })).toBe(false);
  });
});
