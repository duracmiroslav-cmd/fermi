// Per-tier plan policy — the one place for "what each plan (free / pro)
// gets": resource caps (bots, agents) and monthly usage quotas. Change plan
// numbers here. Counter mechanics (key shapes, rate windows) live in
// ./limits.ts.
export type Tier = 'free' | 'pro';

export const BOT_LIMIT: Record<Tier, number> = {
  free: 1,
  pro:  5,
};

export const AGENT_LIMIT: Record<Tier, number> = {
  free: 3,
  pro:  20,
};

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

// Maps purpose to an i18n key. Call sites resolve via $t() so the
// rendered string stays locale-aware.
export const PURPOSE_LABEL_KEY: Record<Purpose, string> = {
  image_gen:    '__labelImageGeneration',
  tts:          '__labelVoiceReplies',
  stt:          '__labelVoiceMessages',
  extended_run: '__labelLongConversations',
  line_push:    '__labelPushMessages',
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
