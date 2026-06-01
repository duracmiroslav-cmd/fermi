import type { CapabilityRow } from '~~/server/utils/capabilities';

// UI-level row model: one row per capability. Provider config lives
// inside the capability's detail page; the list view aggregates
// provider status into a single chip.
export interface FlatCard {
  routeSlug:      string;
  title:          string;
  description:    string | null;
  icon:           string;
  status:         'connected' | 'available' | 'coming_soon' | 'none';
  // Lowercased title + description + provider names so the list-page
  // search can match "tavily" against the Web search row.
  searchHaystack: string;
}

const iconBySlug: Record<string, string> = {
  'time':        'i-lucide-clock',
  'web-search':  'i-lucide-search',
  'web-fetch':   'i-lucide-globe',
  'github':      'i-simple-icons-github',
  'twinkle-hub': 'i-lucide-star',
};

export const getCapabilityIcon = (slug: string): string =>
  iconBySlug[slug] ?? 'i-lucide-puzzle';

export const flattenCapabilities = (list: CapabilityRow[]): FlatCard[] => {
  const out = list.map((capability): FlatCard => {
    const providerNames = (capability.providers ?? []).map(p => p.displayName).join(' ');
    const searchHaystack = [capability.displayName, capability.description ?? '', providerNames]
      .join(' ')
      .toLowerCase();
    const base = {
      routeSlug:   capability.slug,
      title:       capability.displayName,
      description: capability.description,
      icon:        getCapabilityIcon(capability.slug),
      searchHaystack,
    };
    if (capability.credentialType === 'coming_soon') return { ...base, status: 'coming_soon' };
    if (capability.credentialType === 'none') return { ...base, status: 'none' };
    const anyConnected = (capability.providers ?? []).some(p => p.status === 'connected');
    return { ...base, status: anyConnected ? 'connected' : 'available' };
  });
  return out.sort((a, b) => {
    const aComing = a.status === 'coming_soon' ? 1 : 0;
    const bComing = b.status === 'coming_soon' ? 1 : 0;
    if (aComing !== bComing) return aComing - bComing;
    return a.title.localeCompare(b.title);
  });
};
