import { getCurrentUser } from '~~/server/utils/auth';
import { PURPOSES, type Purpose } from '~~/shared/constants/limits';
import { peekQuota } from '~~/shared/quota';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const admin = useSupabaseAdmin();
  const { upstashUrl, upstashToken } = useRuntimeConfig(event);
  const counterEnv = {
    upstashUrl:   upstashUrl || null,
    upstashToken: upstashToken || null,
  };

  // Peek all 5 purposes in parallel — one HTTP round-trip per purpose
  // on Upstash, one DB select per purpose on Postgres. Either way it's
  // fast and uniform, no point in batching across the abstraction.
  const items = await Promise.all(
    PURPOSES.map(async (purpose: Purpose) => {
      const result = await peekQuota(admin, counterEnv, { ownerId: user.id, purpose });
      return {
        purpose,
        used:      result.count,
        cap:       result.cap,
        remaining: result.remaining,
      };
    }),
  );

  return { items };
});
