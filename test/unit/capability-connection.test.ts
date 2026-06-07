import { describe, expect, it } from 'vitest';
import { capabilityNeedsConnection } from '../../shared/capabilities';

const tavily = { slug: 'tavily', displayName: 'Tavily', keyType: 'tavily', status: 'live' as const };

describe('capabilityNeedsConnection', () => {
  it('is false when the capability needs no provider credential', () => {
    expect(capabilityNeedsConnection({
      credentialType: 'none', connectedKeyTypes: new Set(),
    })).toBe(false);
  });

  it('is true when the provider key is not connected', () => {
    expect(capabilityNeedsConnection({
      credentialType: 'providers', providers: [tavily], connectedKeyTypes: new Set(),
    })).toBe(true);
  });

  it('is false once the provider key is connected', () => {
    expect(capabilityNeedsConnection({
      credentialType: 'providers', providers: [tavily], connectedKeyTypes: new Set(['tavily']),
    })).toBe(false);
  });

  it('is false when the only provider is coming_soon', () => {
    expect(capabilityNeedsConnection({
      credentialType:    'providers',
      providers:         [{ ...tavily, status: 'coming_soon' }],
      connectedKeyTypes: new Set(),
    })).toBe(false);
  });
});
