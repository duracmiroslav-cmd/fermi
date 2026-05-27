import { getCurrentUser } from '~~/server/utils/auth';

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const admin = useSupabaseAdmin();
  const { data: botRows, error: botErr } = await admin
    .from('bots')
    .select('id, platform, external_id, display_name, avatar_url, agent_id, disabled_at, webhook_verified_at, created_at')
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (botErr) throw botErr;

  // Resolve attached agents in one round-trip so each row can show which
  // agent drives it. Skips soft-deleted agents, matching the detail page.
  const agentIds = [...new Set(botRows.map(b => b.agent_id).filter((id): id is string => !!id))];
  const agentsById = new Map<string, { id: string; name: string; avatar_url: string | null }>();
  if (agentIds.length) {
    const { data: agentRows, error: agentErr } = await admin
      .from('agents')
      .select('id, name, avatar_url')
      .in('id', agentIds)
      .eq('owner_id', user.id)
      .is('deleted_at', null);
    if (agentErr) throw agentErr;
    for (const a of agentRows) agentsById.set(a.id, a);
  }

  // Most-recent successful reply per bot, derived from agent_runs.
  const { data: lastReplied, error: lastRepliedErr } = await admin
    .rpc('get_bots_last_replied', { p_owner_id: user.id });
  if (lastRepliedErr) throw lastRepliedErr;
  const lastRepliedByBot = new Map<string, string>(
    (lastReplied ?? []).map(r => [r.bot_id, r.last_replied_at]),
  );

  const url = getRequestURL(event);
  return botRows.map((row) => {
    const agent = row.agent_id ? agentsById.get(row.agent_id) ?? null : null;
    return {
      id: row.id,
      platform: row.platform,
      externalId: row.external_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      agentId: row.agent_id,
      disabledAt: row.disabled_at,
      webhookVerifiedAt: row.webhook_verified_at,
      createdAt: row.created_at,
      webhookUrl: `${url.origin}/api/webhook/${row.platform}`,
      agent: agent ? { id: agent.id, name: agent.name, avatarUrl: agent.avatar_url } : null,
      lastRepliedAt: lastRepliedByBot.get(row.id) ?? null,
    };
  });
});
