import type { SupabaseClient } from '@supabase/supabase-js';

// Per-slug metadata that the `capabilities` DB row doesn't carry:
// what credential each one needs and which providers back it.
//
// Adding a provider (e.g. Brave under web-search): extend the
// `providers` array, add the matching key_type to the
// encrypted_credentials enum, and add a connect endpoint under
// /api/connections/<provider>.

export type CredentialType = 'none' | 'providers' | 'coming_soon';

export interface ProviderMeta {
  slug:        string;
  displayName: string;
  keyType:     string;
  status:      'live' | 'coming_soon';
}

export interface CapabilityMeta {
  credentialType: CredentialType;
  providers?:     ProviderMeta[];
}

export const CAPABILITY_META: Record<string, CapabilityMeta> = {
  'time':       { credentialType: 'none' },
  'web-search': {
    credentialType: 'providers',
    providers:      [
      { slug: 'tavily', displayName: 'Tavily', keyType: 'tavily', status: 'live' },
    ],
  },
  'web-fetch': { credentialType: 'none' },
  'github':    {
    credentialType: 'providers',
    providers:      [
      { slug: 'github', displayName: 'GitHub', keyType: 'github', status: 'live' },
    ],
  },
  'google-calendar': { credentialType: 'coming_soon' },
  'notion':          { credentialType: 'coming_soon' },
};

// BYO capabilities (rows with owner_id IS NOT NULL) won't have an
// entry here, so default to "no credential needed", the BYO MCP
// server's own auth lives in its `capabilities.config` jsonb.
export const getCapabilityMeta = (slug: string): CapabilityMeta =>
  CAPABILITY_META[slug] ?? { credentialType: 'none' };

export type ProviderStatus = 'connected' | 'available' | 'coming_soon';

export interface CapabilityProviderRow {
  slug:         string;
  displayName:  string;
  status:       ProviderStatus;
  maskedKey?:   string | null;
  connectedAt?: string;
}

export interface CapabilityRow {
  id:             string;
  slug:           string;
  displayName:    string;
  description:    string | null;
  credentialType: CredentialType;
  providers?:     CapabilityProviderRow[];
}

export type AgentCapabilityRow = CapabilityRow & {
  attached: boolean;
};

// Lists capabilities visible to a user, joined with provider
// credential status read off the user's account-level
// encrypted_credentials rows.
export const listCapabilitiesForUser = async (
  admin: SupabaseClient,
  userId: string,
): Promise<CapabilityRow[]> => {
  const { data: caps, error: capsErr } = await admin
    .from('capabilities')
    .select('id, slug, display_name, description, owner_id')
    .is('deleted_at', null)
    .or(`owner_id.is.null,owner_id.eq.${userId}`)
    .order('owner_id', { ascending: true, nullsFirst: true })
    .order('slug', { ascending: true });
  if (capsErr) throw capsErr;

  const { data: creds, error: credsErr } = await admin
    .from('encrypted_credentials')
    .select('key_type, metadata, created_at')
    .eq('user_id', userId)
    .is('bot_id', null);
  if (credsErr) throw credsErr;

  const credByKeyType = new Map((creds ?? []).map(c => [c.key_type, c]));

  return (caps ?? []).map((cap) => {
    const meta = getCapabilityMeta(cap.slug);
    const row: CapabilityRow = {
      id:             cap.id,
      slug:           cap.slug,
      displayName:    cap.display_name,
      description:    cap.description,
      credentialType: meta.credentialType,
    };
    if (meta.credentialType !== 'providers' || !meta.providers) return row;

    row.providers = meta.providers.map((p): CapabilityProviderRow => {
      if (p.status === 'coming_soon') {
        return { slug: p.slug, displayName: p.displayName, status: 'coming_soon' };
      }
      const cred = credByKeyType.get(p.keyType);
      if (!cred) {
        return { slug: p.slug, displayName: p.displayName, status: 'available' };
      }
      const credMeta = (cred.metadata ?? {}) as { masked_key?: string };
      return {
        slug:        p.slug,
        displayName: p.displayName,
        status:      'connected',
        maskedKey:   credMeta.masked_key ?? null,
        connectedAt: cred.created_at,
      };
    });
    return row;
  });
};
