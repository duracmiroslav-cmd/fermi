import { getCurrentUser } from '~~/server/utils/auth';
import { type CapabilityRow, listCapabilitiesForUser } from '~~/server/utils/capabilities';

export default defineEventHandler(async (event): Promise<CapabilityRow[]> => {
  const user = await getCurrentUser(event);
  const admin = useSupabaseAdmin();
  return listCapabilitiesForUser(admin, user.id);
});
