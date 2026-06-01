import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BUILT_IN_CAPABILITIES,
  type CapabilitySettingField,
  type CredentialType,
  type ProviderMeta,
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

// Surfaced to the capability config UI so each group can render as one
// labelled checkbox. Tool names stay server-side: the client only needs the
// human-readable label and a count for the "(N tools)" hint.
export interface ToolGroupSummary {
  label:     string;
  toolCount: number;
}

export interface CapabilityRow {
  id:                    string;
  slug:                  string;
  displayName:           string;
  description:           string | null;
  credentialType:        CredentialType;
  providers?:            CapabilityProviderRow[];
  // When set, the capability uses group-level toggles (instead of per-tool
  // checkboxes). The agent binding stores its selection as
  // `agent_capabilities.config.enabledGroups` (array of group slugs).
  toolGroups?:           Record<string, ToolGroupSummary>;
  // Initial selection when no `enabledGroups` has been recorded for this
  // agent yet. The UI uses this to pre-check the right boxes.
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

  return (capabilities ?? []).map((capability) => {
    const builtIn = capability.owner_id === null
      ? BUILT_IN_CAPABILITIES[capability.slug]
      : undefined;
    const credentialType: CredentialType = builtIn?.credentialType ?? 'none';
    const providers: ProviderMeta[] | undefined = builtIn?.providers;
    const row: CapabilityRow = {
      id:          capability.id,
      slug:        capability.slug,
      displayName: builtIn?.displayName ?? capability.display_name,
      description: builtIn?.description ?? capability.description,
      credentialType,
    };
    if (builtIn?.config.toolGroups) {
      row.toolGroups = Object.fromEntries(
        Object.entries(builtIn.config.toolGroups).map(([slug, group]) => [
          slug,
          { label: group.label, toolCount: group.tools.length },
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
