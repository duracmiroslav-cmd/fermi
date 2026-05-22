import { serverSupabaseUser } from '#supabase/server';
import { CHANNEL_LIMIT, type Tier } from '~~/shared/constants/tiers';
import { connectChannelInputSchema } from '~~/shared/schemas/channels';

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const body = await readBody(event);
  const parsed = connectChannelInputSchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }

  const admin = useSupabaseAdmin();

  const { data: userRow, error: userErr } = await admin
    .from('users').select('tier').eq('id', user.id).single();
  if (userErr) throw userErr;
  const tier = userRow.tier as Tier;
  const limit = CHANNEL_LIMIT[tier];

  const { count, error: countErr } = await admin
    .from('channels')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
    .is('deleted_at', null);
  if (countErr) throw countErr;
  if ((count ?? 0) >= limit) {
    throw createError({
      statusCode: 403,
      statusMessage: `Channel limit reached for ${tier} tier (max ${limit})`,
    });
  }

  switch (parsed.data.type) {
    case 'line':
      return connectLineChannel(event, admin, user.id, parsed.data);
  }
});
