import type { Tool } from './index.ts';

interface Args {
  timezone?: string;
}

// Validates the IANA timezone via Intl.DateTimeFormat, passing an
// unknown zone throws a RangeError, which lets the model self-correct
// on the next turn instead of getting a silent default.
const formatInZone = (date: Date, timezone: string): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  });
  return formatter.format(date);
};

export const getCurrentTime: Tool = {
  name: 'get_current_time',
  capabilitySlug: 'time',
  description:
    'Get the current wall-clock time in a given IANA timezone (e.g. "Asia/Taipei", "UTC", "America/New_York"). Returns both ISO-8601 UTC and a human-readable local time string.',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description:
          'IANA timezone identifier. Defaults to "UTC" if omitted. Examples: "Asia/Taipei", "Europe/London", "America/Los_Angeles".',
      },
    },
    required: [],
    additionalProperties: false,
  },
  execute: (rawArgs) => {
    const { timezone = 'UTC' } = rawArgs as Args;
    const now = new Date();
    try {
      return {
        iso_utc: now.toISOString(),
        local_time: formatInZone(now, timezone),
        timezone,
      };
    } catch {
      return {
        error: `Unknown timezone "${timezone}". Use an IANA identifier like "Asia/Taipei".`,
      };
    }
  },
};
