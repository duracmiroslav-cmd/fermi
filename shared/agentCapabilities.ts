import type { SupabaseClient } from '@supabase/supabase-js';
import { BUILT_IN_CAPABILITIES, type CapabilityConfig } from './capabilities.ts';

export type { CapabilityConfig } from './capabilities.ts';

export interface AttachedCapability {
  slug:   string;
  config: CapabilityConfig;
}

// Joined against `capabilities` so a soft-deleted catalog row stops
// contributing even if the `agent_capabilities` binding is still there
// (the binding's `on delete cascade` only fires on a hard delete).
export const loadActiveCapabilities = async (
  admin: SupabaseClient,
  agentId: string,
): Promise<AttachedCapability[]> => {
  const { data, error } = await admin
    .from('agent_capabilities')
    .select('config, capability:capabilities!inner(slug, owner_id, config, deleted_at)')
    .eq('agent_id', agentId)
    .is('disabled_at', null)
    .is('capability.deleted_at', null);
  if (error) throw error;

  // Supabase's typegen widens 1-1 embedded resources to arrays even when the
  // FK is many-to-one. Runtime returns a single object; cast through unknown
  // to accept either shape and flatten.
  const rows = (data ?? []) as unknown as Array<{
    config:     CapabilityConfig | null;
    capability:
      | { slug: string; owner_id: string | null; config: CapabilityConfig | null }
      | { slug: string; owner_id: string | null; config: CapabilityConfig | null }[]
      | null;
  }>;
  return rows.flatMap((r) => {
    if (!r.capability) return [];
    const caps = Array.isArray(r.capability) ? r.capability : [r.capability];
    return caps.map((c) => {
      // Built-in (owner_id null): code registry is the source of truth; the DB
      // row's config is intentionally empty. BYO (owner_id set): DB config is
      // user-supplied and the only source. Either way, per-agent overrides in
      // `agent_capabilities.config` shallow-merge on top.
      const baseConfig: CapabilityConfig = c.owner_id === null
        ? (BUILT_IN_CAPABILITIES[c.slug]?.config ?? {})
        : (c.config ?? {});
      return { slug: c.slug, config: { ...baseConfig, ...(r.config ?? {}) } };
    });
  });
};
