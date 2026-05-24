export const SUPPORTED_LOCALES = ['zh-Hant', 'en'] as const;

export type Locale = typeof SUPPORTED_LOCALES[number];

export const normalizeLocale = (input: string): Locale => {
  const [lang = ''] = input.split('-');
  switch (lang.toLowerCase()) {
    case 'zh':
      return 'zh-Hant';
    default:
      return 'en';
  }
};
