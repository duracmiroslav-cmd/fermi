import { z } from 'zod';
import { getCurrentUser } from '~~/server/utils/auth';
import { createByoMcpCapability, probeMcpServer } from '~~/server/utils/mcp';
import { assertPublicUrl } from '~~/server/utils/ssrf';
import { getKek } from '~~/shared/kek';

const bodySchema = z.object({
  url:         z.string().trim().min(1),
  displayName: z.string().trim().min(1).max(80),
  // Bearer token. Omit for an unauthenticated MCP server.
  token:       z.string().trim().min(1).optional(),
});

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);
  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'url and displayName are required' });
  }
  const { url, displayName, token } = parsed.data;

  // SSRF before the probe: the probe fetches a user-supplied URL from this
  // server, so it must be validated first or it is itself the SSRF vector.
  const validUrl = await assertPublicUrl(url);
  await probeMcpServer(validUrl.toString(), token);

  const { fermiKek } = useRuntimeConfig(event);
  const kek = await getKek(fermiKek);
  const admin = useSupabaseAdmin();

  const created = await createByoMcpCapability({
    admin,
    kek,
    ownerId: user.id,
    displayName,
    url:     validUrl.toString(),
    token,
  });

  return { id: created.id, slug: created.slug };
});
