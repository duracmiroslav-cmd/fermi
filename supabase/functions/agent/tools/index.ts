import type { SupabaseClient } from '@supabase/supabase-js';
import { generateImage } from './image-gen.ts';
import { getCurrentTime } from './time.ts';
import { searchWeb } from './web-search.ts';
import { fetchWeb } from './web-fetch.ts';

// Side-effect attachments a tool can produce (image, future audio /
// video). Tools push entries here, the worker drains the array after
// the agent loop ends and appends matching LINE messages to delivery.
// runId + thread context flows in via ToolContext so tools can build
// storage paths without the caller threading them through args.
export type ToolAttachment
  = | {
      type: 'image';
      mime: string;
      sizeBytes: number;
      // Pre-signed URL for LINE to download from. The preview is what
      // shows in the chat list / lock-screen notification — for now
      // identical to original (LINE accepts that).
      originalContentUrl: string;
      previewImageUrl: string;
      // Persisted storage path. Worker writes this back into `messages`
      // so history rebuild can sign a fresh URL and feed it to the LLM
      // on the next turn (same pattern as user-uploaded vision images).
      storagePath: string;
    };

// Per-call context passed to every tool. Tools that don't need a
// field can ignore it. `attachments` is a mutable sink — tools that
// produce media push entries; tools that don't leave it alone.
//
// `toolCallId` is the OpenAI/OpenRouter-issued identifier for this
// specific tool invocation. Tools producing media use it to name
// storage objects so the path itself is an audit trail back to the
// `agent_run_steps` row that recorded the call.
export interface ToolContext {
  admin: SupabaseClient;
  kek: CryptoKey;
  ownerId: string;
  threadId: string;
  runId: string;
  toolCallId: string;
  attachments: ToolAttachment[];
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

const tools: Tool[] = [getCurrentTime, searchWeb, fetchWeb, generateImage];

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
