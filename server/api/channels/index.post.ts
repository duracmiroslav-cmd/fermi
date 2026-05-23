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
  const limit = CHANNEL_LIMIT[userRow.tier as Tier];

  switch (parsed.data.type) {
    case 'line':
      return connectLineChannel(event, admin, user.id, parsed.data, limit);
  }
});
