import { z } from 'zod';
import { getCurrentUser } from '~~/server/utils/auth';
import { storeCredential } from '~~/shared/credentials';
import { getKek } from '~~/shared/kek';

const bodySchema = z.object({
  token: z.string().trim().min(20),
});

// Probe Twinkle Hub's MCP endpoint with a JSON-RPC `initialize` to confirm
// the bearer is accepted before storing. Same intent as the GitHub PAT
// /user probe: catch typo'd or revoked tokens at connect time rather than
// surfacing them later as opaque tool errors. We don't need to send the
// follow-up `notifications/initialized`; a 200/202 with no JSON-RPC error
// is enough to know the token authorizes.
const verifyTwinkleToken = async (token: string): Promise<void> => {
  const res = await fetch('https://api.twinkleai.tw/mcp/', {
    method:  'POST',
    headers: {
      'Content-Type':         'application/json',
      'Accept':               'application/json, text/event-stream',
      'Authorization':        `Bearer ${token}`,
      'MCP-Protocol-Version': '2025-06-18',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id:      1,
      method:  'initialize',
      params:  {
        protocolVersion: '2025-06-18',
        capabilities:    {},
        clientInfo:      { name: 'fermi', version: '1.0.0' },
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 401 || res.status === 403) {
    throw createError({
      statusCode:    401,
      statusMessage: 'Invalid Twinkle Hub token',
      data:          { code: '__errorInvalidTwinkleHubToken' },
    });
  }
  if (!res.ok) {
    throw createError({
      statusCode:    400,
      statusMessage: `Twinkle Hub verification failed (${res.status})`,
      data:          { code: '__errorTwinkleHubVerificationFailed', status: res.status },
    });
  }
};

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);
  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode:    400,
      statusMessage: 'token is required',
      data:          { code: '__errorTokenRequired' },
    });
  }
  const { token } = parsed.data;

  await verifyTwinkleToken(token);

  const { fermiKek } = useRuntimeConfig(event);
  const kek = await getKek(fermiKek);
  const admin = useSupabaseAdmin();

  // Idempotent connect: drop any existing row so re-paste of a rotated
  // token replaces cleanly past the partial unique index on
  // (user_id, key_type) WHERE bot_id IS NULL.
  const { error: removeErr } = await admin
    .from('encrypted_credentials')
    .delete()
    .eq('user_id', user.id)
    .eq('key_type', 'twinkle')
    .is('bot_id', null);
  if (removeErr) throw removeErr;

  const maskedKey = `${token.slice(0, 8)}...${token.slice(-4)}`;

  await storeCredential(admin, kek, {
    userId:    user.id,
    botId:     null,
    keyType:   'twinkle',
    plaintext: token,
    metadata:  { masked_key: maskedKey },
  });

  return { ok: true as const };
});
