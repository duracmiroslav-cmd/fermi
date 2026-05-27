import type { SupabaseClient } from '@supabase/supabase-js';
import { generateImage } from './image-gen.ts';
import { getCurrentTime } from './time.ts';
import { searchWeb } from './web-search.ts';
import { fetchWeb } from './web-fetch.ts';
import { loadCredential, type KeyType } from '../../../../shared/credentials.ts';
import type { AttachedCapability } from '../../../../shared/agentCapabilities.ts';
import { McpClient } from './mcp/client.ts';

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
      // shows in the chat list / lock-screen notification, for now
      // identical to original (LINE accepts that).
      originalContentUrl: string;
      previewImageUrl: string;
      // Persisted storage path. Worker writes this back into `messages`
      // so history rebuild can sign a fresh URL and feed it to the LLM
      // on the next turn (same pattern as user-uploaded vision images).
      storagePath: string;
    };

// Per-call context passed to every tool. Tools that don't need a
// field can ignore it. `attachments` is a mutable sink, tools that
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

export interface Toolset {
  // Tool definitions to hand the LLM this run.
  schemas: ToolSchema[];
  // Runs a tool call by the name the LLM emitted, returning a
  // JSON-stringified result. Unknown-tool / bad-JSON / thrown errors come
  // back as `{ error }` so the model can recover instead of crashing.
  execute: (name: string, argumentsJson: string, ctx: ToolContext) => Promise<string>;
}

// Builds the per-run tool surface from the agent's attached capabilities.
// In-process capabilities resolve to static Tools matching the slug; MCP
// capabilities (config.url present) connect to the remote server, list its
// tools, keep only the configured read-only allowlist, and namespace them
// as `slug__name` to stay unique and route calls back. An MCP server that
// is unreachable or unauthorized is skipped (its tools simply don't appear)
// rather than failing the whole run.
export const buildToolset = async (
  caps: AttachedCapability[],
  base: { admin: SupabaseClient; kek: CryptoKey; ownerId: string },
): Promise<Toolset> => {
  const schemas: ToolSchema[] = [];
  const routers = new Map<
    string,
    (args: Record<string, unknown>, ctx: ToolContext) => unknown | Promise<unknown>
  >();

  for (const cap of caps) {
    if (cap.config.url) {
      try {
        let token: string | undefined;
        if (cap.config.authKeyType) {
          try {
            const cred = await loadCredential(base.admin, base.kek, {
              userId: base.ownerId,
              botId: null,
              keyType: cap.config.authKeyType as KeyType,
            });
            token = cred.plaintext;
          } catch (err) {
            // PGRST116 = owner hasn't connected this provider; connect
            // unauthenticated and let the server reject if it must.
            if ((err as { code?: string })?.code !== 'PGRST116') throw err;
          }
        }

        const client = new McpClient({ url: cap.config.url, token });
        await client.connect();

        const allow = cap.config.toolAllowlist ? new Set(cap.config.toolAllowlist) : null;
        for (const t of await client.listTools()) {
          if (allow && !allow.has(t.name)) continue;
          const llmName = `${cap.slug}__${t.name}`;
          schemas.push({
            type: 'function',
            function: { name: llmName, description: t.description ?? '', parameters: t.inputSchema },
          });
          routers.set(llmName, async (args) => {
            const r = await client.callTool(t.name, args);
            const text = (r.content ?? [])
              .filter(c => c.type === 'text')
              .map(c => c.text ?? '')
              .join('\n');
            if (r.isError) return { error: r.structuredContent ?? text };
            if (r.structuredContent !== undefined) return r.structuredContent;
            return { text };
          });
        }
      } catch (err) {
        console.error(
          `MCP capability "${cap.slug}" skipped:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    } else {
      for (const tool of tools.filter(t => t.capabilitySlug === cap.slug)) {
        schemas.push(toSchema(tool));
        routers.set(tool.name, (args, ctx) => tool.execute(args, ctx));
      }
    }
  }

  const execute = async (name: string, argumentsJson: string, ctx: ToolContext): Promise<string> => {
    const router = routers.get(name);
    if (!router) return JSON.stringify({ error: `Unknown tool: ${name}` });

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argumentsJson) as Record<string, unknown>;
    } catch {
      return JSON.stringify({ error: 'Tool arguments were not valid JSON.' });
    }

    try {
      return JSON.stringify(await router(args, ctx));
    } catch (err) {
      return JSON.stringify({ error: `Tool execution failed: ${String(err)}` });
    }
  };

  return { schemas, execute };
};
