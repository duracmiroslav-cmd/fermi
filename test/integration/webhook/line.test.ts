import { fetch, setup } from '@nuxt/test-utils/e2e';
import { describe, expect, it } from 'vitest';

describe('POST /api/webhook/line', async () => {
  await setup({
    server: true,
    nuxtConfig: {
      runtimeConfig: {
        supabaseUrl: 'http://localhost:54321',
        supabaseServiceRoleKey: 'test-service-role-key',
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

  it('returns 400 when destination is missing', async () => {
    const res = await fetch('/api/webhook/line', {
      method: 'POST',
      body: '{"events":[]}',
      headers: {
        'Content-Type': 'application/json',
        'X-Line-Signature': 'any-signature',
      },
    });
    expect(res.status).toBe(400);
  });

  it('returns 401 when X-Line-Signature is missing', async () => {
    const res = await fetch('/api/webhook/line', {
      method: 'POST',
      body: '{"destination":"Uxxx","events":[]}',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });
});
