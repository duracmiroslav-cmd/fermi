import type { SupabaseClient } from '@supabase/supabase-js';

// Loads the set of capability slugs the agent currently has attached
// and enabled. Joined against `capabilities` so a soft-deleted catalog
// row stops contributing even if the `agent_capabilities` binding row
// is still there (the binding's `on delete cascade` only fires on a
// hard delete of the catalog row).
//
// Returns slugs, not capability_ids: the agent worker's tool registry
// is keyed by slug, and the API surface for "what's attached?" is
// almost always slug-shaped too.
export const loadActiveCapabilitySlugs = async (
  admin: SupabaseClient,
  agentId: string,
): Promise<Set<string>> => {
  const { data, error } = await admin
    .from('agent_capabilities')
    .select('capability:capabilities!inner(slug, deleted_at)')
    .eq('agent_id', agentId)
    .is('disabled_at', null)
    .is('capability.deleted_at', null);
  if (error) throw error;

  // Supabase's typegen widens 1-1 embedded resources to arrays even
  // when the FK is many-to-one. Runtime returns a single object here,
  // but we cast through unknown to accept either shape and flatten.
  const rows = (data ?? []) as unknown as Array<{
    capability: { slug: string } | { slug: string }[] | null;
  }>;
  return new Set(rows.flatMap((r) => {
    if (!r.capability) return [];
    return Array.isArray(r.capability)
      ? r.capability.map(c => c.slug)
      : [r.capability.slug];
  }));
};
