import type { SupabaseClient } from '@supabase/supabase-js';
import { generateImage } from './image-gen.ts';
import { getCurrentTime } from './time.ts';
import { searchWeb } from './web-search.ts';
import { fetchWeb } from './web-fetch.ts';
import { loadCredential, type KeyType } from '../../../../shared/credentials.ts';
import type { AttachedCapability } from '../../../../shared/agentCapabilities.ts';
import { McpClient, type McpTool } from './mcp/client.ts';
import { wrapToolOutput } from '../prompt-guard.ts';

// Worker drains `attachments` after the agent loop ends and appends
// matching LINE messages to delivery.
export type ToolAttachment
  = | {
      type: 'image';
      mime: string;
      sizeBytes: number;
      // For now identical to original; LINE accepts that for preview.
      originalContentUrl: string;
      previewImageUrl: string;
      // Worker writes back into `messages` so history rebuild can re-sign
      // a fresh URL on the next turn.
      storagePath: string;
    };

export interface ToolContext {
  admin: SupabaseClient;
  kek: CryptoKey;
  ownerId: string;
  threadId: string;
  runId: string;
  // Tools producing media use this to name storage objects; the path
  // doubles as an audit trail back to the `agent_run_steps` row.
  toolCallId: string;
  attachments: ToolAttachment[];
}

export interface Tool {
  name: string;
  capabilitySlug: string;
  description: string;
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
  schemas: ToolSchema[];
  execute: (name: string, argumentsJson: string, ctx: ToolContext) => Promise<string>;
}

// Module-level: reused across warm edge-function invocations of the same isolate.
// Key = url only; the tool list is server-side static, independent of which PAT
// calls it. TTL handles server-side deploys; per-user isolation is unnecessary.
interface CachedTools {
  tools:     McpTool[];
  expiresAt: number;
}
const mcpToolCache = new Map<string, CachedTools>();
// 5 min keeps tool lists fresh across rapid successive runs without re-handshaking.
const TOOL_CACHE_TTL_MS = 5 * 60 * 1000;

const loadToken = async (
  base: { admin: SupabaseClient; kek: CryptoKey; ownerId: string },
  authKeyType: string,
): Promise<string | undefined> => {
  try {
    const cred = await loadCredential(base.admin, base.kek, {
      userId: base.ownerId,
      botId: null,
      keyType: authKeyType as KeyType,
    });
    return cred.plaintext;
  } catch (err) {
    // PGRST116: no row → owner hasn't connected this provider yet.
    if ((err as { code?: string })?.code !== 'PGRST116') throw err;
    return undefined;
  }
};

// MCP servers that are unreachable or unauthorized are skipped rather than
// failing the whole run.
export const buildToolset = async (
  capabilities: AttachedCapability[],
  base: { admin: SupabaseClient; kek: CryptoKey; ownerId: string },
): Promise<Toolset> => {
  const schemas: ToolSchema[] = [];
  const routers = new Map<
    string,
    (args: Record<string, unknown>, ctx: ToolContext) => unknown | Promise<unknown>
  >();

  for (const capability of capabilities.filter(c => !c.config.url)) {
    for (const tool of tools.filter(t => t.capabilitySlug === capability.slug)) {
      schemas.push(toSchema(tool));
      routers.set(tool.name, (args, ctx) => tool.execute(args, ctx));
    }
  }

  await Promise.all(
    capabilities
      .filter(capability => !!capability.config.url)
      .map(async (capability) => {
        try {
          const token = capability.config.authKeyType
            ? await loadToken(base, capability.config.authKeyType)
            : undefined;

          const cacheKey = capability.config.url!;

          // Promise-coalesced lazy connect: all tools on this capability share one
          // McpClient. On a cache hit the connect is deferred to the first
          // actual tool call, saving the 3-RTT handshake on warm runs.
          let connectionPromise: Promise<McpClient> | undefined;
          const getClient = (): Promise<McpClient> => {
            connectionPromise ??= (async () => {
              const c = new McpClient({ url: capability.config.url!, token });
              await c.connect();
              return c;
            })();
            return connectionPromise;
          };

          const cached = mcpToolCache.get(cacheKey);
          let mcpTools: McpTool[];
          if (cached && cached.expiresAt > Date.now()) {
            mcpTools = cached.tools;
          } else {
            const client = await getClient();
            mcpTools = await client.listTools();
            mcpToolCache.set(cacheKey, { tools: mcpTools, expiresAt: Date.now() + TOOL_CACHE_TTL_MS });
          }

          const allowlist = capability.config.toolAllowlist ? new Set(capability.config.toolAllowlist) : null;
          for (const t of mcpTools) {
            if (allowlist && !allowlist.has(t.name)) continue;
            const llmName = `${capability.slug}__${t.name}`;
            schemas.push({
              type: 'function',
              function: { name: llmName, description: t.description ?? '', parameters: t.inputSchema },
            });
            routers.set(llmName, async (args) => {
              const client = await getClient();
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
            `MCP capability "${capability.slug}" skipped:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }),
  );

  const execute = async (name: string, argumentsJson: string, ctx: ToolContext): Promise<string> => {
    const router = routers.get(name);
    if (!router) return wrapToolOutput(JSON.stringify({ error: `Unknown tool: ${name}` }));

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argumentsJson) as Record<string, unknown>;
    } catch {
      return wrapToolOutput(JSON.stringify({ error: 'Tool arguments were not valid JSON.' }));
    }

    let result: unknown;
    try {
      result = await router(args, ctx);
    } catch (err) {
      result = { error: `Tool execution failed: ${String(err)}` };
    }
    return wrapToolOutput(JSON.stringify(result));
  };

  return { schemas, execute };
};
