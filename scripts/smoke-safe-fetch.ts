// Smoke test for safe-http.ts. Run with:
//   deno run --allow-net scripts/smoke-safe-fetch.ts
//
// Validates the three concerns from the security review:
//   1. Public domains work (HTTPS, redirects, chunked)
//   2. Literal private hosts blocked (IPv4 and IPv6)
//   3. Hostname → private DNS gets blocked at resolve time

/* eslint-disable no-console -- CLI smoke script; stdout is its output */
import { safeFetch } from '../supabase/functions/agent/tools/safe-http.ts';

interface Case {
  name:          string;
  url:           string;
  expectSuccess: boolean;
  // If success: status code we expect (200, 301, etc.)
  // If failure: substring expected in the error message
  expectMatch:   number | string;
}

const cases: Case[] = [
  { name: 'happy path HTTPS', url: 'https://example.com/', expectSuccess: true, expectMatch: 200 },
  { name: 'redirect (google → www)', url: 'https://google.com/', expectSuccess: true, expectMatch: 200 },
  { name: 'chunked transfer (Cloudflare)', url: 'https://www.cloudflare.com/', expectSuccess: true, expectMatch: 200 },
  { name: 'block literal IPv4 loopback', url: 'http://127.0.0.1/', expectSuccess: false, expectMatch: 'Blocked host' },
  { name: 'block literal IPv6 loopback', url: 'http://[::1]/', expectSuccess: false, expectMatch: 'Blocked host' },
  { name: 'block literal localhost', url: 'http://localhost/', expectSuccess: false, expectMatch: 'Blocked host' },
  { name: 'block link-local IPv4', url: 'http://169.254.169.254/', expectSuccess: false, expectMatch: 'Blocked host' },
  // localtest.me resolves to 127.0.0.1 in public DNS — exercises the
  // post-resolve private-range check, not the literal block.
  { name: 'block via DNS (localtest.me → 127.0.0.1)', url: 'http://localtest.me/', expectSuccess: false, expectMatch: 'private IPv4' },
  { name: 'reject unsupported scheme', url: 'ftp://example.com/', expectSuccess: false, expectMatch: 'Unsupported protocol' },
];

const fmt = (ms: number): string => `${ms.toString().padStart(4)}ms`;

let pass = 0;
let fail = 0;

for (const c of cases) {
  const start = Date.now();
  try {
    const result = await safeFetch(c.url, { maxBytes: 2_000_000, timeoutMs: 8000, maxRedirects: 5 });
    const elapsed = Date.now() - start;
    if (!c.expectSuccess) {
      console.log(`✗ ${fmt(elapsed)} ${c.name}: expected failure but got status=${result.status}`);
      fail++;
      continue;
    }
    if (typeof c.expectMatch === 'number' && result.status !== c.expectMatch) {
      console.log(`✗ ${fmt(elapsed)} ${c.name}: status=${result.status} (wanted ${c.expectMatch})`);
      fail++;
      continue;
    }
    console.log(`✓ ${fmt(elapsed)} ${c.name}: status=${result.status} body=${result.body.length}B ct="${result.contentType.slice(0, 40)}"`);
    pass++;
  } catch (err) {
    const elapsed = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    if (c.expectSuccess) {
      console.log(`✗ ${fmt(elapsed)} ${c.name}: unexpected error: ${msg}`);
      fail++;
      continue;
    }
    if (typeof c.expectMatch === 'string' && !msg.includes(c.expectMatch)) {
      console.log(`✗ ${fmt(elapsed)} ${c.name}: error did not match "${c.expectMatch}", got: ${msg}`);
      fail++;
      continue;
    }
    console.log(`✓ ${fmt(elapsed)} ${c.name}: blocked with "${msg}"`);
    pass++;
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
Deno.exit(fail > 0 ? 1 : 0);
