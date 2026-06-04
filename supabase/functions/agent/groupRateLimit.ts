import type { SupabaseClient } from '@supabase/supabase-js';
import { RATE_WINDOWS, buildGroupRateLimitKey } from '../../../shared/constants/limits.ts';
import { type CounterEnv, createRateLimiter } from '../../../shared/counters/factory.ts';

// Per-(bot, group, member) brake on the two group actions that spend the
// owner's quota: @mention agent replies and voice transcription. Any member
// can trigger these on the owner's key, and group events bypass the webhook's
// per-user limit (it only covers 1:1), so this is their only brake. Returns
// false once any RATE_WINDOWS cap is crossed; the caller surfaces a notice
// instead of running the action. Both actions share one counter per member
// (one budget for "this member's costly group activity").
export const checkGroupMemberRateLimit = async (
  admin: SupabaseClient,
  env:   CounterEnv,
  input: { botId: string; groupId: string; externalUserId: string },
): Promise<boolean> => {
  const limiter = createRateLimiter(admin, env);
  const windows = RATE_WINDOWS.map(w => ({
    key:    buildGroupRateLimitKey({
      botId:          input.botId,
      groupId:        input.groupId,
      externalUserId: input.externalUserId,
      window:         w,
    }),
    ttlSec: w.ttlSec,
    cap:    w.cap,
  }));
  const result = await limiter.check({ windows });
  return !result.blocked;
};
