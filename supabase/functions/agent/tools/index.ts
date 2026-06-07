import type { SupabaseClient } from '@supabase/supabase-js';
import { generateImage } from './image-gen.ts';
import { getCurrentTime } from './time.ts';
import { cancelReminder, createReminder, listReminders } from './reminders.ts';
import { searchWeb } from './web-search.ts';
import { fetchWeb } from './web-fetch.ts';
import { searchKnowledge } from './knowledge-search.ts';
import { forgetMemory, listMemories, saveMemory } from './memory.ts';
import { loadCredential, type KeyType } from '../../../../shared/credentials.ts';
import {
  FreeByokRequiredError,
  type KeyPurpose,
  PlatformKeyNotConfiguredError,
  resolveKey,
} from '../../../../shared/keys.ts';
import type { AttachedCapability, CapabilityConfig } from '../../../../shared/agentCapabilities.ts';
import { DEFAULT_TOOLS } from '../../../../shared/capabilityTools.ts';
import { McpClient, type McpTool } from './mcp/client.ts';
import type { ThreadSubjectType } from '../threads.ts';
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
  // The agent being run. Scopes knowledge-base retrieval to this agent's
  // documents (match_knowledge_chunks filters by it).
  agentId: string;
  threadId: string;
  // The LINE conversation this loop is serving. Reminder tools need both:
  // bot_id + thread_id locate where a fired reminder pushes back to, and
  // external_user_id scopes the per-end-user slot cap and cancel ownership.
  botId: string;
  externalUserId: string;
  // The conversation subject this loop serves: a 1:1 user or a group. Memory
  // tools scope by (botId, subjectType, subjectExternalId) so recall is keyed
  // to the person/group, surviving thread rotation and an agent swap. For a
  // 1:1 turn subjectExternalId equals externalUserId; in a group it's the
  // group id while externalUserId is the individual who spoke.
  subjectType: ThreadSubjectType;
  subjectExternalId: string;
  runId: string;
  // Tools producing media use this to name storage objects; the path
  // doubles as an audit trail back to the `agent_run_steps` row.
  toolCallId: string;
  attachments: ToolAttachment[];
  // Per-agent config of the capability owning this tool, from
  // `agent_capabilities.config`. Owner-set runtime knobs (e.g. image safety)
  // the worker forwards upstream — bound at registration, never LLM-fillable.
  capabilityConfig?: CapabilityConfig;
}

export interface Tool {
  name: string;
  capabilitySlug: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => unknown | Promise<unknown>;
}

const tools: Tool[] = [
  getCurrentTime,
  createReminder,
  listReminders,
  cancelReminder,
  searchWeb,
  fetchWeb,
  generateImage,
  searchKnowledge,
  saveMemory,
  listMemories,
  forgetMemory,
];

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

// Cached across warm invocations of the same isolate, keyed by capability
// id. Built-in capabilities are a single shared row → one shared entry
// (their tool list is server-side static). BYO capabilities are per-owner
// rows → per-owner entries, so a server returning a token-dependent tool
// list can't leak one user's tools into another's prompt. TTL handles deploys.
interface CachedTools {
  tools:     McpTool[];
  expiresAt: number;
}
const mcpToolCache = new Map<string, CachedTools>();
// 5 min keeps tool lists fresh across rapid successive runs without re-handshaking.
const TOOL_CACHE_TTL_MS = 5 * 60 * 1000;

// Platform fallback tokens for built-in MCP providers, by authKeyType. A
// provider listed here is platform-backed: it resolves through resolveKey's
// Free→BYOK / Pro→platform rule (keep its `platformBacked` flag in
// shared/capabilities.ts in step). github is absent on purpose — its token is
// the owner's OAuth credential, never the platform's; byo_mcp is per-user URLs.
const PLATFORM_MCP_KEYS: Record<string, string | undefined> = {
  twinkle: Deno.env.get('TWINKLE_API_KEY') ?? undefined,
};

const loadToken = async (
  base: { admin: SupabaseClient; kek: CryptoKey; ownerId: string },
  authKeyType: string,
  capabilityId: string,
): Promise<string | undefined> => {
  // Platform-backed provider (twinkle): same tier policy as the paid in-process
  // tools. A Free owner without their own token, or Pro with no platform key
  // configured, yields undefined so the capability is skipped (badge shows it)
  // rather than failing the run.
  if (authKeyType in PLATFORM_MCP_KEYS) {
    try {
      const { key } = await resolveKey(base.admin, base.kek, {
        ownerId:     base.ownerId,
        purpose:     authKeyType as KeyPurpose,
        platformKey: PLATFORM_MCP_KEYS[authKeyType] ?? null,
      });
      return key;
    } catch (err) {
      if (err instanceof FreeByokRequiredError || err instanceof PlatformKeyNotConfiguredError) return undefined;
      throw err;
    }
  }

  try {
    const cred = await loadCredential(base.admin, base.kek, {
      userId: base.ownerId,
      botId: null,
      keyType: authKeyType as KeyType,
      // byo_mcp tokens are scoped per capability; the owner's github token
      // stays account-level (capability_id null).
      capabilityId: authKeyType === 'byo_mcp' ? capabilityId : null,
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
      // Bind the owning capability's config at registration so the tool reads
      // owner settings without them ever entering the LLM-facing schema.
      routers.set(tool.name, (args, ctx) =>
        tool.execute(args, { ...ctx, capabilityConfig: capability.config }));
    }
  }

  await Promise.all(
    capabilities
      .filter(capability => !!capability.config.url)
      .map(async (capability) => {
        try {
          const token = capability.config.authKeyType
            ? await loadToken(base, capability.config.authKeyType, capability.id)
            : undefined;

          const cacheKey = capability.id;

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

          // Allowlist sources, in priority order:
          //   1. Per-agent `config.tools` override (the user explicitly picked
          //      a subset on the capability sub-page).
          //   2. For grouped capabilities (twinkle-hub) with no override, the
          //      union of tools belonging to `defaultEnabledGroups`.
          //   3. For matrix capabilities (github) with no override, the read
          //      columns of `CAPABILITY_TOOL_GROUPS[slug]` — same source the
          //      sub-page renders, so the safety boundary stays in one file.
          let allowlist: Set<string> | null = null;
          if (capability.config.tools) {
            allowlist = new Set(capability.config.tools);
          } else if (capability.config.toolGroups && capability.config.defaultEnabledGroups) {
            allowlist = new Set(
              capability.config.defaultEnabledGroups.flatMap(
                g => capability.config.toolGroups?.[g]?.tools ?? [],
              ),
            );
          } else if (DEFAULT_TOOLS[capability.slug]) {
            allowlist = new Set(DEFAULT_TOOLS[capability.slug]);
          }
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
