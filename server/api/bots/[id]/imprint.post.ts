import { getCurrentUser } from '~~/server/utils/auth';
import { getUuidParam } from '~~/server/utils/route-params';

// Arms a one-time imprint code on a bot: the owner opens this window from the
// dashboard, then DMs the code to the bot from their own LINE account. The
// worker binds that sender as master and clears the code (see tryImprintMaster).
// A short TTL keeps the claim window narrow. The code is not a secret stored
// long-term — it's single-use and expiring — so it's written in plaintext.

// No ambiguous glyphs (no I/O/0/1): the owner reads it off the dashboard and
// types or pastes it into LINE.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const IMPRINT_TTL_MS = 10 * 60 * 1000;

const generateCode = (): string => {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
};

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);
  const id = getUuidParam(event, 'id');

  const admin = useSupabaseAdmin();
  const { data: bot, error: botErr } = await admin
    .from('bots')
    .select('id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (botErr) throw botErr;
  if (!bot) {
    throw createError({ statusCode: 404, statusMessage: 'Bot not found', data: { code: '__errorBotNotFound' } });
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + IMPRINT_TTL_MS).toISOString();
  const { error: armErr } = await admin
    .from('bots')
    .update({ imprint_code: code, imprint_code_expires_at: expiresAt })
    .eq('id', id)
    .eq('owner_id', user.id);
  if (armErr) throw armErr;

  return { code, expiresAt };
});
