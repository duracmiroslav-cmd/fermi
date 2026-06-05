// Composes every domain's tools into the one fermion toolset. The loop
// calls execute(name, argsJson, ctx) but the end-user ToolContext it
// passes is ignored — these tools take ids + a bound ownerId instead.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Toolset } from '../agent/tools/index.ts';
import type { FermionTool } from './tool.ts';
import { agentTools } from './agent.ts';
import { botTools } from './bot.ts';
import { connectTools } from './account.ts';

const ALL_TOOLS: FermionTool[] = [...agentTools, ...botTools, ...connectTools];

export const FERMION_MUTATING_TOOLS: readonly string[] =
  ALL_TOOLS.filter(t => t.mutating).map(t => t.schema.function.name);

export const buildFermionToolset = (admin: SupabaseClient, ownerId: string): Toolset => {
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
      try {
        return JSON.stringify(await tool.run(args, { admin, ownerId }));
      } catch (err) {
        return JSON.stringify({ error: `Tool execution failed: ${String(err)}` });
      }
    },
  };
};
