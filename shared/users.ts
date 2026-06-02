import type { SupabaseClient } from '@supabase/supabase-js';
import { type Locale, normalizeLocale } from './locale.ts';

export interface OwnerContext {
  // Bot owner's locale stands in for LINE end user locale — LINE's
  // Messaging API doesn't surface user language.
  locale:   Locale;
  // IANA zone the agent loop injects as wall-clock context (drives
  // reminder time resolution and any future scheduling feature).
  timezone: string;
}

// One read of the owner's row for both fields the worker needs per
// message — locale (notice wording) and timezone (time context).
export const loadOwnerContext = async (
  admin: SupabaseClient,
  userId: string,
): Promise<OwnerContext> => {
  const { data, error: userErr } = await admin
    .from('users')
    .select('locale, timezone')
    .eq('id', userId)
    .maybeSingle();
  if (userErr) throw userErr;
  return {
    locale:   data?.locale ? normalizeLocale(data.locale) : 'zh-Hant',
    timezone: data?.timezone || 'Asia/Taipei',
  };
};
