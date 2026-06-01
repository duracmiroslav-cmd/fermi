import type { Tier } from './tiers.ts';

// Purpose: a monthly-quota-gated fermi resource. Strings are stored in
// `usage_counters.purpose` (Postgres impl) and Upstash keys; keep them
// short + stable. `extended_run` echoes the `agent_runs` vocabulary —
// one extended_run = one run that exceeded the LINE 25s reply budget
// and had to fall back to Push API. `line_push` is LINE-coupled by
// design; future Telegram etc. get their own `<platform>_push`.
export type Purpose
  = | 'image_gen'
    | 'tts'
    | 'stt'
    | 'extended_run'
    | 'line_push';

export const PURPOSES: readonly Purpose[]
  = ['image_gen', 'tts', 'stt', 'extended_run', 'line_push'] as const;

export const PURPOSE_LABEL: Record<Purpose, string> = {
  image_gen:    '圖片生成',
  tts:          '語音回覆',
  stt:          '語音輸入',
  extended_run: '長對話',
  line_push:    'LINE 主動推播',
};

// Monthly quota caps by tier × purpose. Numbers derived in
// .claude/docs/roadmap.md (Defense layer section). Pro caps are soft
// limits — Pro user hitting an image_gen / tts / stt cap can BYO key
// for true unlimited (CTA copy reflects this).
export const MONTHLY_QUOTA: Record<Purpose, Record<Tier, number>> = {
  image_gen:    { free: 10, pro: 200 },
  tts:          { free: 30, pro: 500 },
  stt:          { free: 30, pro: 500 },
  extended_run: { free: 10, pro: 100 },
  line_push:    { free: 200, pro: 2000 },
};

// Rate-limit windows: 3 concentric fixed windows per (bot, external
// user). 1min catches bursts, 1day catches absolute volume, 1hour is
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

// Owner-scoped rate limit for dashboard TTS preview. Distinct key
// shape from buildRateLimitKey (which is per bot+user) because
// previews fire from logged-in dashboard sessions where there's no
// bot / external-user pair — the natural blast-radius unit is the
// owner. Reuses RATE_WINDOWS unchanged (30/min, 200/hr, 1000/day)
// because preview cost is similar order of magnitude to a normal
// reply call.
export const buildPreviewRateLimitKey = (input: {
  ownerId: string;
  window:  RateWindow;
  now?:    Date;
}): string => {
  const now = input.now ?? new Date();
  const bucket = formatBucket(input.window.scope, now);
  return `rl:owner:${input.ownerId}:tts_preview:${input.window.scope}:${bucket}`;
};

// Monthly bucket suffix for quota keys; UTC month is fine because
// fermi's billing month doesn't have to align with any user's local
// month — the boundary just needs to be deterministic and globally
// shared so Upstash / Postgres impls agree on key ownership.
export const buildUsageQuotaKey = (input: {
  ownerId: string;
  purpose: Purpose;
  now?:    Date;
}): string => {
  const now = input.now ?? new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `quota:${input.ownerId}:${input.purpose}:${period}`;
};

// Period string ('YYYY-MM') stored alongside the count in the Postgres
// impl. Same derivation as buildUsageQuotaKey above.
export const getMonthlyPeriod = (now: Date = new Date()): string =>
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

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
