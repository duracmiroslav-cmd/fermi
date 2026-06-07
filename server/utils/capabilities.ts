import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BUILT_IN_CAPABILITIES,
  type CapabilitySettingField,
  type CredentialType,
  type ProviderMeta,
  capabilityNeedsConnection,
} from '~~/shared/capabilities';

export type { CapabilitySettingField } from '~~/shared/capabilities';

export type { CredentialType, ProviderMeta } from '~~/shared/capabilities';

export type ProviderStatus = 'connected' | 'available' | 'coming_soon';

export interface CapabilityProviderRow {
  slug:         string;
  displayName:  string;
  status:       ProviderStatus;
  maskedKey?:   string | null;
  connectedAt?: string;
}

// Surfaced to the capability config UI so each group renders as a labelled
// section of per-tool checkboxes. Tool names are upstream identifiers; the
// UI strips the upstream prefix (e.g. `twtools-`) at render time.
export interface ToolGroupSummary {
  label: string;
  tools: string[];
}

export interface CapabilityRow {
  id:                    string;
  slug:                  string;
  displayName:           string;
  description:           string | null;
  credentialType:        CredentialType;
  // True when this capability needs a provider credential the owner hasn't
  // connected — so an attached-but-unconnected capability reads as "needs
  // connection" instead of silently failing at run time. Computed via
  // `capabilityNeedsConnection`; false for capabilities that need no provider.
  needsConnection:       boolean;
  // BYO (user-created) capability vs fermi built-in. The connectors page
  // routes these to the Custom MCP servers manager instead of the built-in
  // Capabilities list; both still attach to agents the same way.
  isCustom:              boolean;
  providers?:            CapabilityProviderRow[];
  // When set, the capability config UI renders per-tool checkboxes grouped
  // under each group's label. The agent binding stores its per-tool selection
  // as `agent_capabilities.config.tools`.
  toolGroups?:           Record<string, ToolGroupSummary>;
  // Tools belonging to these groups are pre-checked when the agent binding
  // hasn't saved its own `tools` list yet.
  defaultEnabledGroups?: string[];
  // Owner-config form descriptor. When present, the row renders a settings
  // panel; saved values land in `agent_capabilities.config`.
  settings?:             CapabilitySettingField[];
}

export type AgentCapabilityRow = CapabilityRow & {
  attached:    boolean;
  agentConfig: Record<string, unknown>;
};

// Joined with provider credential status read off the user's
// account-level encrypted_credentials rows. For built-in rows
// (owner_id NULL), display metadata comes from the code registry; the
// DB row is just an FK target. BYO rows (owner_id set) carry their own
// user-supplied metadata.
export const listCapabilitiesForUser = async (
  admin: SupabaseClient,
  userId: string,
): Promise<CapabilityRow[]> => {
  const { data: capabilities, error: capabilityErr } = await admin
    .from('capabilities')
    .select('id, slug, display_name, description, owner_id')
    .is('deleted_at', null)
    .or(`owner_id.is.null,owner_id.eq.${userId}`)
    .order('owner_id', { ascending: true, nullsFirst: true })
    .order('slug', { ascending: true });
  if (capabilityErr) throw capabilityErr;

  const { data: creds, error: credsErr } = await admin
    .from('encrypted_credentials')
    .select('key_type, metadata, created_at')
    .eq('user_id', userId)
    .is('bot_id', null);
  if (credsErr) throw credsErr;

  const credByKeyType = new Map((creds ?? []).map(c => [c.key_type, c]));
  const connectedKeyTypes = new Set(credByKeyType.keys());

  return (capabilities ?? []).map((capability) => {
    const builtIn = capability.owner_id === null
      ? BUILT_IN_CAPABILITIES[capability.slug]
      : undefined;
    const credentialType: CredentialType = builtIn?.credentialType ?? 'none';
    const providers: ProviderMeta[] | undefined = builtIn?.providers;
    const row: CapabilityRow = {
      id:              capability.id,
      slug:            capability.slug,
      displayName:     builtIn?.displayName ?? capability.display_name,
      description:     builtIn?.description ?? capability.description,
      credentialType,
      needsConnection: capabilityNeedsConnection({
        credentialType,
        providers,
        connectedKeyTypes,
      }),
      isCustom: capability.owner_id !== null,
    };
    if (builtIn?.config.toolGroups) {
      row.toolGroups = Object.fromEntries(
        Object.entries(builtIn.config.toolGroups).map(([slug, group]) => [
          slug,
          { label: group.label, tools: [...group.tools] },
        ]),
      );
      row.defaultEnabledGroups = builtIn.config.defaultEnabledGroups;
    }
    if (builtIn?.settings) row.settings = builtIn.settings;
    if (credentialType !== 'providers' || !providers) return row;

    row.providers = providers.map((p): CapabilityProviderRow => {
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
