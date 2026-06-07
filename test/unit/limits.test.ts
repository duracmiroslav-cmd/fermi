import { describe, expect, it } from 'vitest';
import {
  CHAT_RATE_WINDOWS,
  RATE_WINDOWS,
  type RateWindow,
  buildChatRateLimitKey,
  buildPreviewRateLimitKey,
  buildRateLimitKey,
} from '../../shared/constants/limits';

const owner = '00000000-0000-0000-0000-000000000001';
const bot = '11111111-1111-1111-1111-111111111111';
const user = 'U0c8f8b6b865daa7311a5b424af94d174';

const utc = (...args: [number, number, number, number?, number?, number?, number?]): Date =>
  new Date(Date.UTC(...args));

const rlKey = (scope: RateWindow['scope'], now: Date): string => {
  const window = RATE_WINDOWS.find(w => w.scope === scope)!;
  return buildRateLimitKey({ botId: bot, externalUserId: user, window, now });
};

describe('buildRateLimitKey', () => {
  it('composes bot, user, scope, and time bucket', () => {
    expect(rlKey('minute', utc(2026, 4, 28, 14, 7)))
      .toBe(`rl:bot:${bot}:user:${user}:minute:202605281407`);
  });

  describe('minute scope', () => {
    it('keeps the same key within a minute', () => {
      expect(rlKey('minute', utc(2026, 4, 28, 14, 7, 0)))
        .toBe(rlKey('minute', utc(2026, 4, 28, 14, 7, 59)));
    });

    it('rolls a fresh key across the minute boundary', () => {
      expect(rlKey('minute', utc(2026, 4, 28, 14, 7, 59, 999)))
        .not.toBe(rlKey('minute', utc(2026, 4, 28, 14, 8, 0, 0)));
    });
  });

  describe('hour scope', () => {
    it('keeps the same key within an hour', () => {
      expect(rlKey('hour', utc(2026, 4, 28, 14, 7)))
        .toBe(rlKey('hour', utc(2026, 4, 28, 14, 59)));
    });

    it('rolls a fresh key across the hour boundary', () => {
      expect(rlKey('hour', utc(2026, 4, 28, 14, 59, 59)))
        .not.toBe(rlKey('hour', utc(2026, 4, 28, 15, 0, 0)));
    });
  });

  describe('day scope', () => {
    it('keeps the same key within a UTC day', () => {
      expect(rlKey('day', utc(2026, 4, 28, 0, 0, 0)))
        .toBe(rlKey('day', utc(2026, 4, 28, 23, 59, 59)));
    });

    it('rolls a fresh key across the UTC day boundary', () => {
      expect(rlKey('day', utc(2026, 4, 28, 23, 59, 59)))
        .not.toBe(rlKey('day', utc(2026, 4, 29, 0, 0, 0)));
    });
  });
});

// The dashboard agent chat runs a full LLM loop on the owner's key, so it must
// stay a separate, tighter budget than the cheap TTS preview — otherwise a user
// can point the chat at an expensive model and burn the owner's spend up to the
// generic 1000/day cap. These lock the split in against a future re-merge.
describe('chat rate limit', () => {
  const capOf = (windows: readonly RateWindow[], scope: RateWindow['scope']): number =>
    windows.find(w => w.scope === scope)!.cap;

  it.each(['minute', 'hour', 'day'] as const)(
    'caps the %s window below the generic preview budget',
    (scope) => {
      expect(capOf(CHAT_RATE_WINDOWS, scope)).toBeLessThan(capOf(RATE_WINDOWS, scope));
    },
  );

  it('counts under a separate key namespace from the tts preview', () => {
    const window = CHAT_RATE_WINDOWS.find(w => w.scope === 'day')!;
    const now = utc(2026, 4, 28);
    expect(buildChatRateLimitKey({ ownerId: owner, window, now }))
      .not.toBe(buildPreviewRateLimitKey({ ownerId: owner, window, now }));
  });
});
