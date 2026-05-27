import type { SupabaseClient } from '@supabase/supabase-js';

// Config stored on a builtin `capabilities` row. An MCP capability is
// identified by the presence of `url` (its tools come from a remote MCP
// server); in-process capabilities have a static tool matching the slug and
// leave this empty. No separate `type` column: `url` is the discriminator
// and is required for MCP anyway.
export interface CapabilityConfig {
  // Remote MCP server endpoint (Streamable HTTP). Presence => MCP capability.
  url?:           string;
  // Which stored credential (KeyType) to send as the bearer token, if the
  // server needs auth (e.g. 'github' for the GitHub MCP server).
  authKeyType?:   string;
  // Read-only allowlist: only these tool names are surfaced to the LLM. The
  // server may expose far more (incl. destructive writes); everything not
  // listed is hidden.
  toolAllowlist?: string[];
}

export interface AttachedCapability {
  slug:   string;
  config: CapabilityConfig;
}

// Loads the capabilities the agent currently has attached and enabled, with
// their config. Joined against `capabilities` so a soft-deleted catalog row
// stops contributing even if the `agent_capabilities` binding is still there
// (the binding's `on delete cascade` only fires on a hard delete).
export const loadActiveCapabilities = async (
  admin: SupabaseClient,
  agentId: string,
): Promise<AttachedCapability[]> => {
  const { data, error } = await admin
    .from('agent_capabilities')
    .select('capability:capabilities!inner(slug, config, deleted_at)')
    .eq('agent_id', agentId)
    .is('disabled_at', null)
    .is('capability.deleted_at', null);
  if (error) throw error;

  // Supabase's typegen widens 1-1 embedded resources to arrays even when the
  // FK is many-to-one. Runtime returns a single object; cast through unknown
  // to accept either shape and flatten.
  const rows = (data ?? []) as unknown as Array<{
    capability:
      | { slug: string; config: CapabilityConfig | null }
      | { slug: string; config: CapabilityConfig | null }[]
      | null;
  }>;
  return rows.flatMap((r) => {
    if (!r.capability) return [];
    const caps = Array.isArray(r.capability) ? r.capability : [r.capability];
    return caps.map(c => ({ slug: c.slug, config: c.config ?? {} }));
  });
};
