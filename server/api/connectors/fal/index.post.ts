import { z } from 'zod';
import { getCurrentUser } from '~~/server/utils/auth';
import { storeCredential } from '~~/shared/credentials';
import { getKek } from '~~/shared/kek';

const bodySchema = z.object({
  // fal keys are `<key_id>:<key_secret>`. Unlike Tavily (free search) or GitHub
  // (free /user), fal has no zero-cost auth probe — its cheapest call runs a
  // real ~$0.04 image — so we sanity-check the shape here and defer the real
  // check to the first generate_image call, which already returns a clear key
  // error. A shape check still catches the common paste mistakes.
  apiKey: z.string().trim().min(20).regex(/.+:.+/),
});

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);
  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode:    400,
      statusMessage: 'apiKey is required',
      data:          { code: '__errorApiKeyRequired' },
    });
  }
  const { apiKey } = parsed.data;

  const { fermiKek } = useRuntimeConfig(event);
  const kek = await getKek(fermiKek);
  const admin = useSupabaseAdmin();

  // Idempotent connect: drop any existing row first so re-paste of a rotated
  // key replaces cleanly past the partial unique index on
  // (user_id, key_type) WHERE bot_id IS NULL.
  const { error: removeErr } = await admin
    .from('encrypted_credentials')
    .delete()
    .eq('user_id', user.id)
    .eq('key_type', 'fal')
    .is('bot_id', null);
  if (removeErr) throw removeErr;

  // Masked preview so the connectors card can echo which fal key fermi holds
  // without exposing the secret half.
  const maskedKey = `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;

  await storeCredential(admin, kek, {
    userId:    user.id,
    botId:     null,
    keyType:   'fal',
    plaintext: apiKey,
    metadata:  { masked_key: maskedKey },
  });

  return { ok: true as const };
});
