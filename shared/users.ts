import type { SupabaseClient } from '@supabase/supabase-js';
import { type Locale, normalizeLocale } from './locale.ts';

// Bot owner's locale stands in for LINE end user locale — LINE's
// Messaging API doesn't surface user language.
export const loadOwnerLocale = async (
  admin: SupabaseClient,
  userId: string,
): Promise<Locale> => {
  const { data, error: userErr } = await admin
    .from('users')
    .select('locale')
    .eq('id', userId)
    .maybeSingle();
  if (userErr) throw userErr;
  return data?.locale ? normalizeLocale(data.locale) : 'zh-Hant';
};
