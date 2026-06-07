// Rate-limit counter mechanics: windows + key shapes. These guard the
// operator's own spend — a stranger who adds the bot, or a group member,
// can't run the owner's API key up with a flood of messages.

// Group threads hold messages from people who never signed up for fermi
// (group members), so their stored content gets a retention ceiling — the
// one carve-out from the "content is permanent" model; 1:1 history stays.
// Mirrored by `purge_expired_group_messages` in SQL — keep both in sync.
export const GROUP_MESSAGE_RETENTION_DAYS = 90;

// Baseline rate-limit windows — the default caps (CHAT_RATE_WINDOWS
// below overrides them for the costlier agent chat). 3 concentric fixed
// windows: 1min catches bursts, 1day catches absolute volume, 1hour is
// the redundant-middle layer kept for industry symmetry (Cloudflare /
// Vercel / GitHub pattern); drop later if 1hour never independently
// blocks. Numbers are baseline heuristics — re-tune from observed
// `'rate_limited'` log distribution after Phase A ships.
export interface RateWindow {
  scope:  'minute' | 'hour' | 'day';
  ttlSec: number;
  cap:    number;
}

export const RATE_WINDOWS: readonly RateWindow[] = [
  { scope: 'minute', ttlSec: 60, cap: 30 },
  { scope: 'hour', ttlSec: 3600, cap: 200 },
  { scope: 'day', ttlSec: 86400, cap: 1000 },
] as const;

// Tighter owner caps for the dashboard agent chat. Unlike a TTS preview
// (~$0.000025/call), each turn is a full LLM loop on the owner's own key
// and can run on whatever model they picked (possibly an expensive one),
// so the generic RATE_WINDOWS day cap of 1000 would expose the owner's
// spend to abuse. ~200/day still covers heavy legitimate tuning; minute
// is a burst guard (each turn waits for a reply, so 15 is plenty).
export const CHAT_RATE_WINDOWS: readonly RateWindow[] = [
  { scope: 'minute', ttlSec: 60, cap: 15 },
  { scope: 'hour', ttlSec: 3600, cap: 60 },
  { scope: 'day', ttlSec: 86400, cap: 200 },
] as const;

// Builds the Upstash / Postgres key for a (bot, external user, window)
// combo. Time bucket suffix lets fixed-window counters auto-roll: when
// the wall clock crosses a window boundary, the next request lands on
// a fresh key and starts counting from zero.
//
// Bucket math uses unix epoch seconds floored to window size, then
// formatted as a 0-padded ISO-like string for readability when grepping
// Redis / Postgres.
export const buildRateLimitKey = (input: {
  botId:          string;
  externalUserId: string;
  window:         RateWindow;
  now?:           Date;
}): string => {
  const now = input.now ?? new Date();
  const bucket = formatBucket(input.window.scope, now);
  return `rl:bot:${input.botId}:user:${input.externalUserId}:${input.window.scope}:${bucket}`;
};

// Per-(bot, group, member) rate limit for the group actions that spend the
// owner's quota: @mention agent replies and voice transcription. In a group
// any member can trigger these on the owner's key, and group events bypass
// the webhook's per-user limit (it only covers 1:1), so this is their only
// brake. Distinct namespace from buildRateLimitKey so a member's 1:1 budget
// and their per-group budget don't share a counter. Reuses RATE_WINDOWS.
export const buildGroupRateLimitKey = (input: {
  botId:          string;
  groupId:        string;
  externalUserId: string;
  window:         RateWindow;
  now?:           Date;
}): string => {
  const now = input.now ?? new Date();
  const bucket = formatBucket(input.window.scope, now);
  return `rl:bot:${input.botId}:group:${input.groupId}:user:${input.externalUserId}:${input.window.scope}:${bucket}`;
};

// Owner-scoped rate limit for dashboard TTS preview. Distinct key
// shape from buildRateLimitKey (which is per bot+user) because
// previews fire from logged-in dashboard sessions where there's no
// bot / external-user pair — the natural blast-radius unit is the
// owner. Reuses RATE_WINDOWS unchanged (30/min, 200/hr, 1000/day): a
// preview is TTS-only (no LLM) at ~$0.000025/call, so even the loose
// generic cap is a harmless ceiling. Don't copy this onto a pricier
// op — the agent chat runs a full LLM loop and gets its own tighter
// CHAT_RATE_WINDOWS.
export const buildPreviewRateLimitKey = (input: {
  ownerId: string;
  window:  RateWindow;
  now?:    Date;
}): string => {
  const now = input.now ?? new Date();
  const bucket = formatBucket(input.window.scope, now);
  return `rl:owner:${input.ownerId}:tts_preview:${input.window.scope}:${bucket}`;
};

// Owner-scoped key for the dashboard agent chat. Distinct namespace from
// tts_preview so the two try-outs don't share one budget and the chat's
// tighter caps (CHAT_RATE_WINDOWS) tune independently.
export const buildChatRateLimitKey = (input: {
  ownerId: string;
  window:  RateWindow;
  now?:    Date;
}): string => {
  const now = input.now ?? new Date();
  const bucket = formatBucket(input.window.scope, now);
  return `rl:owner:${input.ownerId}:test_chat:${input.window.scope}:${bucket}`;
};

// Bucket suffix derivation kept inline rather than imported so this
// file has no runtime dependencies — both Deno worker and Nuxt server
// import it.
const formatBucket = (scope: RateWindow['scope'], now: Date): string => {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  if (scope === 'day') return `${y}${m}${d}`;
  const h = String(now.getUTCHours()).padStart(2, '0');
  if (scope === 'hour') return `${y}${m}${d}${h}`;
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  return `${y}${m}${d}${h}${min}`;
};
