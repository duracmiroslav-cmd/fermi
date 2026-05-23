export const SUPPORTED_LOCALES = ['zh-Hant', 'en'] as const;

export type Locale = typeof SUPPORTED_LOCALES[number];

const DEFAULT_LOCALE: Locale = 'zh-Hant';

// CLDR Simplified-default regions; fermi only ships Traditional + English.
const SIMPLIFIED_ZH_REGIONS = new Set(['CN', 'SG', 'MY']);

export const normalizeLocale = (input?: string | null): Locale => {
  if (!input?.trim()) return DEFAULT_LOCALE;
  try {
    const { language, script, region } = new Intl.Locale(input.trim());
    if (language !== 'zh') return 'en';
    if (script === 'Hans' || (region && SIMPLIFIED_ZH_REGIONS.has(region))) return 'en';
    return 'zh-Hant';
  } catch {
    return DEFAULT_LOCALE;
  }
};
