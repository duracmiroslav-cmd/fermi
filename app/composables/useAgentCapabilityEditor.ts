import type { BreadcrumbItem } from '@nuxt/ui';
import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue';
import type { AgentCapabilityRow } from '~~/server/utils/capabilities';
import { DEFAULT_TOOLS } from '~~/shared/capabilityTools';

interface AgentSummary {
  id:   string;
  name: string;
}

export interface AgentCapabilityEditorContext {
  agentId:           ComputedRef<string>;
  slug:              ComputedRef<string>;
  agent:             Ref<AgentSummary | null>;
  capability:        ComputedRef<AgentCapabilityRow | null>;
  pending:           ComputedRef<boolean>;
  isLocked:          ComputedRef<boolean>;
  lockedHint:        ComputedRef<{ text: string; to: string } | null>;
  statusHeadline:    ComputedRef<string>;
  breadcrumbItems:   ComputedRef<BreadcrumbItem[]>;
  effectiveTools:    ComputedRef<Set<string>>;
  effectiveSettings: ComputedRef<Record<string, number>>;
  isToolEnabled:     (tool: string) => boolean;
  isDirty:           ComputedRef<boolean>;
  saving:            Ref<boolean>;
  attaching:         Ref<boolean>;
  onToolToggle:      (tool: string, enabled: boolean | 'indeterminate') => void;
  onGroupSelectAll:  (groupTools: string[]) => void;
  onGroupClearAll:   (groupTools: string[]) => void;
  onSettingChange:   (key: string, value: number) => void;
  onAttachToggle:    (next: boolean) => Promise<void>;
  onSave:            () => Promise<void>;
  getDefaultTools:   (cap: AgentCapabilityRow) => string[];
  getGroupCounts:    (groupTools: string[]) => { on: number; total: number };
  stripToolPrefix:   (tool: string) => string;
}

export interface UseAgentCapabilityEditorOptions {
  // The agent whose binding is being edited. Pass a getter or ref when the
  // value comes from route params; pass a plain string when the page knows
  // its agent statically (rare — listed for completeness).
  agentId: MaybeRefOrGetter<string>;
  // The capability being edited. Pass a getter / ref for the generic
  // `[slug].vue` route (slug comes from route params); pass a literal for
  // capability-specific routes whose file name owns the slug
  // (e.g. `github.vue` passes `'github'`).
  slug:    MaybeRefOrGetter<string>;
}

// Page-level state + handlers for the capability-config editor chrome
// (header, breadcrumb, locked alert, action bar). Both the generic
// `[slug].vue` page and capability-specific pages like `github.vue`
// call this and pass the returned ctx to `<AgentCapabilityEditor>`.
//
// Knows about both fermi shapes (server-supplied `toolGroups` and
// client-rendered `CAPABILITY_TOOL_GROUPS` matrix) so the chrome's
// status headline and dirty signal stay consistent across pages.
//
// Decoupled from `useRoute()`: the caller passes `agentId` and `slug`
// explicitly. That keeps composable inputs an honest contract rather than
// a route-shape assumption, and the same composable would work in a modal
// or embedded context where the route doesn't reflect the editor target.
export const useAgentCapabilityEditor = (
  opts: UseAgentCapabilityEditorOptions,
): AgentCapabilityEditorContext => {
  const { t } = useI18n();
  const notify = useNotify();

  const agentId = computed(() => toValue(opts.agentId));
  const slug = computed(() => toValue(opts.slug));

  const { data: agent, pending: agentPending } = useApiFetch<AgentSummary>(
    () => `/api/agents/${agentId.value}`,
  );

  const {
    data:    rows,
    pending: rowsPending,
    refresh: refreshRows,
  } = useApiFetch<AgentCapabilityRow[]>(
    () => `/api/agents/${agentId.value}/capabilities`,
  );

  const pending = computed(() => agentPending.value || rowsPending.value);
  const capability = computed(() => (rows.value ?? []).find(c => c.slug === slug.value) ?? null);

  const isLocked = computed((): boolean => {
    const cap = capability.value;
    if (!cap || cap.attached) return false;
    if (cap.credentialType === 'coming_soon') return true;
    if (cap.credentialType === 'providers') {
      return !cap.providers?.some(p => p.status === 'connected');
    }
    return false;
  });

  const lockedHint = computed((): { text: string; to: string } | null => {
    const cap = capability.value;
    if (!cap || !isLocked.value) return null;
    if (cap.credentialType === 'coming_soon') return null;
    return { text: t('__actionConnectCredential'), to: `/dashboard/connectors/${cap.slug}` };
  });

  const hasSettings = (cap: AgentCapabilityRow) => !!cap.settings?.length;

  const stripToolPrefix = (tool: string) => tool.replace(/^twtools-|^opendata-/, '');

  // Catalog default mirrors the dispatcher's runtime fallback: union of tools
  // belonging to `defaultEnabledGroups` for grouped capabilities, else the
  // matrix capability's read-only baseline.
  const getDefaultTools = (cap: AgentCapabilityRow): string[] => {
    if (cap.toolGroups && cap.defaultEnabledGroups) {
      return cap.defaultEnabledGroups.flatMap(g => cap.toolGroups?.[g]?.tools ?? []);
    }
    return [...(DEFAULT_TOOLS[cap.slug] ?? [])];
  };

  const localTools = ref<string[] | null>(null);
  const localSettings = ref<Record<string, number> | null>(null);

  const savedTools = computed((): string[] => {
    const cap = capability.value;
    if (!cap) return [];
    const saved = cap.agentConfig?.tools as string[] | undefined;
    return saved ?? getDefaultTools(cap);
  });

  const effectiveTools = computed((): Set<string> => new Set(localTools.value ?? savedTools.value));

  const savedSettings = computed((): Record<string, number> => {
    const cap = capability.value;
    if (!cap?.settings) return {};
    return Object.fromEntries(
      cap.settings.map((f) => {
        const v = cap.agentConfig?.[f.key];
        return [f.key, typeof v === 'number' ? v : f.default];
      }),
    );
  });

  const effectiveSettings = computed((): Record<string, number> => localSettings.value ?? savedSettings.value);

  const isToolEnabled = (tool: string) => effectiveTools.value.has(tool);

  // Comparing sorted arrays so order changes don't read as dirty — the
  // dispatcher treats both as sets and only the membership matters.
  const sortedKey = (xs: string[]) => [...new Set(xs)].sort().join(',');

  const isDirty = computed((): boolean => {
    const cap = capability.value;
    if (!cap) return false;
    if (hasSettings(cap)) {
      return localSettings.value !== null
        && Object.keys(savedSettings.value).some(
          k => effectiveSettings.value[k] !== savedSettings.value[k],
        );
    }
    if (localTools.value === null) return false;
    return sortedKey(localTools.value) !== sortedKey(savedTools.value);
  });

  const onToolToggle = (tool: string, enabled: boolean | 'indeterminate') => {
    if (enabled === 'indeterminate') return;
    const current = [...effectiveTools.value];
    if (enabled) {
      if (!current.includes(tool)) current.push(tool);
    } else {
      const idx = current.indexOf(tool);
      if (idx !== -1) current.splice(idx, 1);
    }
    localTools.value = current;
  };

  const onGroupSelectAll = (groupTools: string[]) => {
    const current = new Set(effectiveTools.value);
    for (const t of groupTools) current.add(t);
    localTools.value = [...current];
  };

  const onGroupClearAll = (groupTools: string[]) => {
    const current = new Set(effectiveTools.value);
    for (const t of groupTools) current.delete(t);
    localTools.value = [...current];
  };

  const onDiscard = () => {
    localTools.value = null;
    localSettings.value = null;
  };

  const onSettingChange = (key: string, value: number) => {
    localSettings.value = { ...effectiveSettings.value, [key]: value };
  };

  const attaching = ref(false);

  const onAttachToggle = async (next: boolean) => {
    const cap = capability.value;
    if (!cap || attaching.value) return;
    attaching.value = true;
    try {
      if (next) {
        await $fetch(`/api/agents/${agentId.value}/capabilities`, {
          method: 'POST',
          body:   { capabilityId: cap.id },
        });
        notify.success(t('__toastCapabilityAttached', { name: cap.displayName }));
      } else {
        await $fetch(`/api/agents/${agentId.value}/capabilities/${cap.id}`, { method: 'DELETE' });
        notify.success(t('__toastCapabilityDetached', { name: cap.displayName }));
      }
      await refreshRows();
    } catch (e) {
      notify.error(next ? t('__toastAttachFailed') : t('__toastDetachFailed'), e);
    } finally {
      attaching.value = false;
    }
  };

  const saving = ref(false);

  const onSave = async () => {
    const cap = capability.value;
    if (!cap || saving.value) return;
    let config: Record<string, unknown>;
    if (hasSettings(cap)) {
      config = effectiveSettings.value;
    } else {
      config = { tools: [...effectiveTools.value] };
    }
    saving.value = true;
    try {
      await $fetch(`/api/agents/${agentId.value}/capabilities/${cap.id}`, {
        method: 'PATCH',
        body:   { config },
      });
      notify.success(t('__toastSaved'));
      // Refresh first so saved agentConfig matches the local edit before we
      // drop the local override — otherwise the form briefly snaps to the
      // pre-edit saved state in the gap between clear and refetch.
      await refreshRows();
      onDiscard();
    } catch (e) {
      notify.error(t('__toastSaveFailed'), e);
    } finally {
      saving.value = false;
    }
  };

  // Per-group counts power both the "N/M" label and the select-all/clear-all
  // affordance — clicking the link does whichever flips the larger half.
  const getGroupCounts = (groupTools: string[]) => {
    let on = 0;
    for (const t of groupTools) if (effectiveTools.value.has(t)) on++;
    return { on, total: groupTools.length };
  };

  const breadcrumbItems = computed((): BreadcrumbItem[] => [
    { label: t('__labelAgent', 2), to: '/dashboard/agents' },
    { label: agent.value?.name ?? '', to: `/dashboard/agents/${agentId.value}` },
    { label: t('__actionEdit'), to: `/dashboard/agents/${agentId.value}/edit` },
    { label: capability.value?.displayName ?? '' },
  ]);

  // Single-word header status, mirroring the connectors detail page's
  // "Connected / Available" headline. Per-group N/M lives in the body
  // where the actual selection is — no need to duplicate scope info up here.
  const statusHeadline = computed((): string => {
    const cap = capability.value;
    if (!cap) return '';
    if (cap.credentialType === 'coming_soon') return t('__statusComingSoon');
    return cap.attached ? t('__statusAttached') : t('__statusNotAttached');
  });

  return {
    agentId,
    slug,
    agent,
    capability,
    pending,
    isLocked,
    lockedHint,
    statusHeadline,
    breadcrumbItems,
    effectiveTools,
    effectiveSettings,
    isToolEnabled,
    isDirty,
    saving,
    attaching,
    onToolToggle,
    onGroupSelectAll,
    onGroupClearAll,
    onSettingChange,
    onAttachToggle,
    onSave,
    getDefaultTools,
    getGroupCounts,
    stripToolPrefix,
  };
};
