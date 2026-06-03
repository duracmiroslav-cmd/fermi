import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchGroupMemberProfile } from './channels/line.ts';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Opaque fallback when LINE won't give a display name (member hasn't
// shared their profile, or the API is unavailable). Last 4 of the LINE
// userId keep distinct speakers distinguishable without storing PII.
const fallbackLabel = (userId: string): string => `[user_${userId.slice(-4)}]`;

// Resolves a group member's display name: group_members cache first,
// refreshed from LINE past the TTL. Never throws — any failure degrades
// to the opaque fallback so a label is always produced for the relay.
export const resolveDisplayName = async (
  admin: SupabaseClient,
  accessToken: string,
  botId: string,
  groupId: string,
  userId: string,
): Promise<string> => {
  const { data: cached } = await admin
    .from('group_members')
    .select('display_name, cached_at')
    .eq('bot_id', botId)
    .eq('external_group_id', groupId)
    .eq('external_user_id', userId)
    .maybeSingle();

  if (cached && Date.now() - new Date(cached.cached_at).getTime() < CACHE_TTL_MS) {
    return cached.display_name ?? fallbackLabel(userId);
  }

  let displayName: string | null = null;
  let pictureUrl: string | null = null;
  try {
    const profile = await fetchGroupMemberProfile(accessToken, groupId, userId);
    if (profile) {
      displayName = profile.displayName;
      pictureUrl = profile.pictureUrl;
    }
  } catch (err) {
    // LINE 5xx / network. Reuse a stale name if we have one rather than
    // overwriting the cache with a failure.
    console.warn('group member profile fetch failed', { botId, err });
    return cached?.display_name ?? fallbackLabel(userId);
  }

  // Cache even a null name (member declined profile sharing) so the next
  // message for the same opaque member doesn't re-hit LINE until the TTL.
  const { error: upsertErr } = await admin
    .from('group_members')
    .upsert({
      bot_id:            botId,
      external_group_id: groupId,
      external_user_id:  userId,
      display_name:      displayName,
      picture_url:       pictureUrl,
      cached_at:         new Date().toISOString(),
    });
  if (upsertErr) console.warn('group member cache upsert failed', { botId, err: upsertErr });

  return displayName ?? fallbackLabel(userId);
};
