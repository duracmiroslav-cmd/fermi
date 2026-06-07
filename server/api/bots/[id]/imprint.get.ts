import { getCurrentUser } from '~~/server/utils/auth';
import { getUuidParam } from '~~/server/utils/route-params';

// Imprint status for the claim widget to poll: `bound` flips true once the
// worker has imprinted a master (master_external_id set). The live code rides
// back too so a re-mounted widget shows the same one instead of re-arming.

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);
  const id = getUuidParam(event, 'id');

  const admin = useSupabaseAdmin();
  const { data: bot, error: botErr } = await admin
    .from('bots')
    .select('master_external_id, imprint_code, imprint_code_expires_at')
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (botErr) throw botErr;
  if (!bot) {
    throw createError({ statusCode: 404, statusMessage: 'Bot not found', data: { code: '__errorBotNotFound' } });
  }

  return {
    bound:     bot.master_external_id !== null,
    code:      bot.imprint_code,
    expiresAt: bot.imprint_code_expires_at,
  };
});
