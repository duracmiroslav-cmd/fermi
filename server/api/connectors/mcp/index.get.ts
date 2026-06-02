import { getCurrentUser } from '~~/server/utils/auth';
import { type ByoMcpServer, listByoMcpServers } from '~~/server/utils/mcp';

export default defineEventHandler(async (event): Promise<ByoMcpServer[]> => {
  const user = await getCurrentUser(event);
  const admin = useSupabaseAdmin();
  return listByoMcpServers(admin, user.id);
});
