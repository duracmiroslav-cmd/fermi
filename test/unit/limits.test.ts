import { describe, expect, it } from 'vitest';
import {
  RATE_WINDOWS,
  type RateWindow,
  monthlyPeriod,
  rateLimitKey,
  usageQuotaKey,
} from '../../shared/constants/limits';

const owner = '00000000-0000-0000-0000-000000000001';
const bot = '11111111-1111-1111-1111-111111111111';
const user = 'U0c8f8b6b865daa7311a5b424af94d174';

const utc = (...args: [number, number, number, number?, number?, number?, number?]): Date =>
  new Date(Date.UTC(...args));

const qKey = (now: Date): string =>
  usageQuotaKey({ ownerId: owner, purpose: 'tts', now });

const rlKey = (scope: RateWindow['scope'], now: Date): string => {
  const window = RATE_WINDOWS.find(w => w.scope === scope)!;
  return rateLimitKey({ botId: bot, externalUserId: user, window, now });
};

describe('monthlyPeriod', () => {
  it.each([
    [utc(2026, 0, 1), '2026-01', 'january pads to 01'],
    [utc(2026, 8, 1), '2026-09', 'september pads to 09'],
    [utc(2026, 9, 1), '2026-10', 'october stays two-digit'],
    [utc(2026, 11, 31, 23, 59), '2026-12', 'last minute of december'],
    [utc(2027, 0, 1, 0, 0), '2027-01', 'first minute of next year'],
  ])('returns %s suffix (%s)', (date, expected) => {
    expect(monthlyPeriod(date)).toBe(expected);
  });

  it('reads UTC, not local time', () => {
    // 23:30Z on May 31 is still May UTC even where local clock has flipped to June.
    expect(monthlyPeriod(utc(2026, 4, 31, 23, 30))).toBe('2026-05');
  });
});

describe('usageQuotaKey', () => {
  it('composes owner, purpose, and period', () => {
    expect(usageQuotaKey({ ownerId: owner, purpose: 'image_gen', now: utc(2026, 4, 28, 12) }))
      .toBe(`quota:${owner}:image_gen:2026-05`);
  });

  describe('monthly bucket', () => {
    it('keeps the same key within a UTC month', () => {
      expect(qKey(utc(2026, 4, 1, 0, 0, 0)))
        .toBe(qKey(utc(2026, 4, 31, 23, 59, 59)));
    });

    it('rolls a fresh key across the UTC month boundary', () => {
      expect(qKey(utc(2026, 4, 31, 23, 59, 59)))
        .not.toBe(qKey(utc(2026, 5, 1, 0, 0, 0)));
    });
  });
});

describe('rateLimitKey', () => {
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
