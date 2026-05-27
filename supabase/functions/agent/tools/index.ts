import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentTime } from './time.ts';
import { searchWeb } from './web-search.ts';
import { fetchWeb } from './web-fetch.ts';

// Per-call context passed to every tool so they can load the bot
// owner's credentials (e.g., personal Tavily key) on the fly.
// Kept minimal: tools that don't need it can ignore the second arg.
export interface ToolContext {
  admin: SupabaseClient;
  kek: CryptoKey;
  ownerId: string;
}

export interface Tool {
  // OpenRouter / OpenAI tool-call function name. What the LLM sees
  // and emits. Snake_case by convention (e.g. `get_current_time`).
  name: string;
  // Capability catalog slug this tool implements. The worker filters
  // by this against `agent_capabilities` so only tools whose
  // capability is attached + enabled for the current agent are
  // exposed. Multiple tools may share a slug (e.g. a future MCP that
  // exposes several functions under one `notion` capability).
  capabilitySlug: string;
  description: string;
  // JSON Schema for arguments, passed straight to OpenRouter.
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => unknown | Promise<unknown>;
}

const tools: Tool[] = [getCurrentTime, searchWeb, fetchWeb];

const byName = new Map(tools.map(t => [t.name, t]));

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const toSchema = (t: Tool): ToolSchema => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
});

// Filters the registry to tools whose capability is attached to the
// current agent. Agents with no attachments see an empty tool set
// (the LLM falls back to plain chat). Catalog slugs that have no
// runtime implementation yet (github, notion, etc.) yield nothing
// here — the attach UI looks ready but the LLM correctly can't call
// what isn't wired up.
export const toolSchemasForCapabilities = (
  attachedSlugs: ReadonlySet<string>,
): ToolSchema[] => tools.filter(t => attachedSlugs.has(t.capabilitySlug)).map(toSchema);

// Returns a JSON-stringified tool result suitable to send back as a
// `role: 'tool'` message. Errors (unknown tool, bad JSON args, thrown
// during execute) are caught and returned as `{ error: ... }` so the
// model can recover instead of the loop crashing.
export const executeTool = async (
  name: string,
  argumentsJson: string,
  ctx: ToolContext,
): Promise<string> => {
  const tool = byName.get(name);
  if (!tool) return JSON.stringify({ error: `Unknown tool: ${name}` });

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argumentsJson) as Record<string, unknown>;
  } catch {
    return JSON.stringify({ error: 'Tool arguments were not valid JSON.' });
  }

  try {
    const result = await tool.execute(args, ctx);
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({ error: `Tool execution failed: ${String(err)}` });
  }
};
