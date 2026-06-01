// Minimal Sentry envelope POST for the Deno-runtime agent worker.
//
// Why hand-roll: `@sentry/deno` was deprecated upstream, and `@sentry/core`
// pulls in transports / integrations we don't need (~200KB) for one
// `captureException` call. The envelope endpoint accepts a documented HTTP
// payload, so a 40-line fetch is enough.
//
// When `SENTRY_DSN` is unset the module no-ops — same ergonomics as the
// SDK init in `sentry.{client,server}.config.ts`. Set via Supabase Edge
// Function secrets, not the project `.env` (which is for Nuxt only).

interface ParsedDsn {
  envelopeUrl: string;
  publicKey:   string;
}

const parseDsn = (dsn: string): ParsedDsn | null => {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');
    if (!url.username || !projectId) return null;
    return {
      envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey:   url.username,
    };
  } catch {
    return null;
  }
};

const dsn = parseDsn(Deno.env.get('SENTRY_DSN') ?? '');

const eventId = (): string => crypto.randomUUID().replace(/-/g, '');

// Conservative PII scrubbing applied at the wrapper boundary — extras coming
// in from call sites are caller-controlled, but we still drop the common
// secret-looking shapes in case future contributors pass a webhook payload
// or a JWT into ctx.extra without thinking about it.
const SECRET_KEY_PATTERN = /token|secret|key|signature|cookie|authorization/i;

const scrubExtras = (extras: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extras)) {
    if (SECRET_KEY_PATTERN.test(k)) {
      out[k] = '[redacted]';
    } else {
      out[k] = v;
    }
  }
  return out;
};

interface CaptureContext {
  tags?:  Record<string, string>;
  extra?: Record<string, unknown>;
}

export const captureException = async (err: unknown, ctx: CaptureContext = {}): Promise<void> => {
  if (!dsn) return;

  const error = err instanceof Error ? err : new Error(String(err));
  const event = {
    event_id:    eventId(),
    timestamp:   new Date().toISOString(),
    platform:    'javascript',
    level:       'error',
    environment: Deno.env.get('SUPABASE_ENV') ?? 'production',
    server_name: 'agent-worker',
    tags:        ctx.tags,
    extra:       ctx.extra ? scrubExtras(ctx.extra) : undefined,
    exception:   {
      values: [{
        type:       error.name,
        value:      error.message,
        stacktrace: error.stack ? { frames: parseStack(error.stack) } : undefined,
      }],
    },
  };

  const envelope = [
    JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n');

  try {
    await fetch(dsn.envelopeUrl, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/x-sentry-envelope',
        'X-Sentry-Auth':  `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=fermi-agent-worker/1.0`,
      },
      body:   envelope,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Swallow — Sentry being down should never break the worker's primary
    // job (replying to LINE). Console keeps the local-dev signal.
    console.error('sentry envelope POST failed', { event_id: event.event_id });
  }
};

// Minimal stack parser: each "    at fnName (file:line:col)" line becomes a
// frame Sentry can render. Good enough for symbolicated Deno stacks; Sentry
// falls back to the raw `value` string when frames are missing.
const STACK_LINE = /^\s*at\s+(?:(?<fn>[^(]+)\s+\()?(?<src>[^):]+):(?<line>\d+):(?<col>\d+)\)?$/;

const parseStack = (stack: string): unknown[] => {
  const frames = [];
  for (const line of stack.split('\n')) {
    const m = line.match(STACK_LINE);
    if (!m?.groups) continue;
    frames.push({
      function: m.groups.fn?.trim() || '<anonymous>',
      filename: m.groups.src,
      lineno:   Number(m.groups.line),
      colno:    Number(m.groups.col),
    });
  }
  return frames.reverse();
};
