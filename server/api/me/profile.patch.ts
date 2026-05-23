import { getCurrentUser } from '~~/server/utils/auth';
import { updateProfileInputSchema } from '~~/shared/schemas/profile';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const body = await readBody(event);
  const parsed = updateProfileInputSchema.safeParse(body);
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }

  if (Object.keys(parsed.data).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' });
  }

  const admin = useSupabaseAdmin();
  const { data, error } = await admin
    .from('users')
    .update(parsed.data)
    .eq('id', user.id)
    .select('display_name, locale, timezone, avatar_url')
    .single();
  if (error) throw error;

  return data;
});
