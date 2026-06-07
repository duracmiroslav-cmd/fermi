// Composes every domain's tools into the one management toolset (Tier 2,
// armed only for an agent's master in maintenance mode). The loop calls
// execute(name, argsJson, ctx) but the end-user ToolContext it passes is
// ignored — these tools take ids + a bound ownerId instead.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Toolset } from '../index.ts';
import type { ManagementTool } from './tool.ts';
import { agentTools } from './agent.ts';
import { botTools } from './bot.ts';
import { connectTools } from './account.ts';

export type ManagementChannel = 'web' | 'line';

// webOnly tools render a browser widget on the web console; on LINE there is
// no widget surface, so they point the master at the dashboard instead.
const SITE_URL = Deno.env.get('PUBLIC_SITE_URL') ?? 'https://fermi.tw';

const ALL_TOOLS: ManagementTool[] = [...agentTools, ...botTools, ...connectTools];

export const MANAGEMENT_MUTATING_TOOLS: readonly string[] =
  ALL_TOOLS.filter(t => t.mutating).map(t => t.schema.function.name);

export const buildManagementToolset = (
  admin: SupabaseClient,
  ownerId: string,
  opts: { channel: ManagementChannel },
): Toolset => {
  const byName = new Map(ALL_TOOLS.map(t => [t.schema.function.name, t]));
  return {
    schemas: ALL_TOOLS.map(t => t.schema),
    execute: async (name: string, argumentsJson: string): Promise<string> => {
      const tool = byName.get(name);
      if (!tool) return JSON.stringify({ error: `Unknown tool: ${name}` });
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(argumentsJson) as Record<string, unknown>;
      } catch {
        return JSON.stringify({ error: 'Tool arguments were not valid JSON.' });
      }
      // On LINE a widget tool can't run — there's no browser surface for the
      // form / OAuth / QR. Hand back a dashboard link for the master to finish
      // it there rather than pretending the capability doesn't exist.
      if (opts.channel === 'line' && tool.webOnly) {
        const path = tool.linkPath?.(args) ?? '/dashboard';
        return JSON.stringify({
          web_only: true,
          open_url: `${SITE_URL}${path}`,
          message:  'This step needs the fermi dashboard. Share the link so they can finish it in a browser.',
        });
      }
      try {
        return JSON.stringify(await tool.run(args, { admin, ownerId }));
      } catch (err) {
        return JSON.stringify({ error: `Tool execution failed: ${String(err)}` });
      }
    },
  };
};
