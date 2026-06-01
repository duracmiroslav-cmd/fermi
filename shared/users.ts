import type { SupabaseClient } from '@supabase/supabase-js';
import { type Locale, normalizeLocale } from './locale.ts';

// Loads the persisted locale for a user, used by the worker to pick
// which language to address LINE end users in. Bot owner's locale is
// the proxy: there's no per-LINE-user language signal from LINE's
// Messaging API, so owner locale is the best available default.
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
