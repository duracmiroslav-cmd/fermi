import { createHmac } from 'node:crypto';
import { fetch, setup } from '@nuxt/test-utils/e2e';
import { describe, expect, it } from 'vitest';

const CHANNEL_SECRET = 'test-channel-secret';

const sign = (body: string): string => createHmac('sha256', CHANNEL_SECRET).update(body).digest('base64');

describe('POST /api/webhook/line', async () => {
  await setup({
    server: true,
    nuxtConfig: {
      runtimeConfig: {
        supabaseUrl: 'http://localhost:54321',
        supabaseServiceRoleKey: 'test-service-role-key',
        lineChannelSecret: CHANNEL_SECRET,
      },
    },
  });

  it('returns 400 for empty body', async () => {
    const res = await fetch('/api/webhook/line', {
      method: 'POST',
      body: '',
    });
    expect(res.status).toBe(400);
  });

  it('returns 401 when X-Line-Signature is missing', async () => {
    const res = await fetch('/api/webhook/line', {
      method: 'POST',
      body: '{"events":[]}',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when signature does not match', async () => {
    const res = await fetch('/api/webhook/line', {
      method: 'POST',
      body: '{"events":[]}',
      headers: {
        'Content-Type': 'application/json',
        'X-Line-Signature': 'not-a-valid-signature',
      },
    });
    expect(res.status).toBe(401);
  });

  it('passes the signature gate when HMAC matches', async () => {
    const body = '{"events":[]}';
    const res = await fetch('/api/webhook/line', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        'X-Line-Signature': sign(body),
      },
    });
    // Signature gate passed if status is NOT 401.
    // Downstream enqueue may 500 against the fake Supabase URL,
    // which is acceptable for this gate-only assertion.
    expect(res.status).not.toBe(401);
  });
});
