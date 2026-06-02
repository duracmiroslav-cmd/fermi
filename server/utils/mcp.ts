// BYO custom MCP server connect lifecycle — the multi-row sibling of
// byok.ts. Connect = SSRF-validate (caller) → initialize probe → create an
// owned capability → store the per-capability bearer (if any), rolling the
// capability back if the token won't store.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CapabilityConfig } from '~~/shared/capabilities';
import { storeCredential } from '~~/shared/credentials';

const PROTOCOL_VERSION = '2025-06-18';

// initialize probe against a (already SSRF-validated) user URL. Mirrors the
// connect-time probe for github / twinkle: a 200/202 with no HTTP error
// means the URL speaks MCP and accepts the token — the JSON-RPC body isn't
// parsed. Catches typo'd / revoked tokens and dead URLs now instead of as
// opaque tool errors mid-conversation later.
export const probeMcpServer = async (url: string, token?: string): Promise<void> => {
  const headers: Record<string, string> = {
    'Content-Type':         'application/json',
    'Accept':               'application/json, text/event-stream',
    'MCP-Protocol-Version': PROTOCOL_VERSION,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body:   JSON.stringify({
        jsonrpc: '2.0',
        id:      1,
        method:  'initialize',
        params:  {
          protocolVersion: PROTOCOL_VERSION,
          capabilities:    {},
          clientInfo:      { name: 'fermi', version: '1.0.0' },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not reach the MCP server' });
  }
  if (res.status === 401 || res.status === 403) {
    throw createError({ statusCode: 401, statusMessage: 'The MCP server rejected the token' });
  }
  if (!res.ok) {
    throw createError({ statusCode: 400, statusMessage: `MCP server verification failed (${res.status})` });
  }
};

// Derives a readable slug from the free-text display name; the slug surfaces
// in the LLM tool name (`slug__tool`), so it must stay human-legible. ASCII
// fallback covers names that slugify to nothing (e.g. all-CJK).
const slugify = (name: string): string => {
  const s = name.toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'custom-mcp';
};

const maskToken = (t: string): string => `${t.slice(0, 6)}...${t.slice(-4)}`;

export interface CreateByoMcpParams {
  admin:       SupabaseClient;
  kek:         CryptoKey;
  ownerId:     string;
  displayName: string;
  url:         string;
  token?:      string;
}

export const createByoMcpCapability = async (
  params: CreateByoMcpParams,
): Promise<{ id: string; slug: string }> => {
  const { admin, kek, ownerId, displayName, url, token } = params;
  const base = slugify(displayName);
  const authKeyType = token ? 'byo_mcp' : null;

  // create_byo_capability rejects a taken slug (23505). Display names are
  // free text so collisions are expected; bump a numeric suffix until one
  // lands, bounded so a pathological case can't loop forever.
  let id: string | undefined;
  let slug = '';
  for (let attempt = 0; attempt < 25; attempt++) {
    slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error: createErr } = await admin.rpc('create_byo_capability', {
      p_owner_id:      ownerId,
      p_slug:          slug,
      p_display_name:  displayName,
      p_url:           url,
      p_auth_key_type: authKeyType,
    });
    if (!createErr) {
      id = data as string;
      break;
    }
    if (createErr.code === '23505') continue;
    throw createErr;
  }
  if (!id) {
    throw createError({ statusCode: 409, statusMessage: 'Too many servers with a similar name; rename and retry' });
  }

  if (token) {
    try {
      await storeCredential(admin, kek, {
        userId:       ownerId,
        botId:        null,
        capabilityId: id,
        keyType:      'byo_mcp',
        plaintext:    token,
        metadata:     { masked_key: maskToken(token) },
      });
    } catch (err) {
      // Roll the capability back: a server row without its bearer would
      // connect unauthenticated and surface as a confusing 401 later.
      const { error: rollbackErr } = await admin.rpc('delete_byo_capability', {
        p_owner_id: ownerId, p_capability_id: id,
      });
      if (rollbackErr) {
        console.error('BYO MCP rollback failed', { capabilityId: id, rollbackErr });
      }
      throw err;
    }
  }

  return { id, slug };
};

export interface ByoMcpServer {
  id:          string;
  slug:        string;
  displayName: string;
  url:         string;
  hasToken:    boolean;
  maskedToken: string | null;
  connectedAt: string;
}

export const listByoMcpServers = async (
  admin: SupabaseClient,
  userId: string,
): Promise<ByoMcpServer[]> => {
  const { data: capabilities, error: capabilityErr } = await admin
    .from('capabilities')
    .select('id, slug, display_name, config, created_at')
    .eq('owner_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (capabilityErr) throw capabilityErr;

  const owned = (capabilities ?? []).filter(c => (c.config as CapabilityConfig)?.url);

  const { data: creds, error: credErr } = await admin
    .from('encrypted_credentials')
    .select('capability_id, metadata')
    .eq('user_id', userId)
    .eq('key_type', 'byo_mcp');
  if (credErr) throw credErr;
  const credByCapability = new Map((creds ?? []).map(c => [c.capability_id, c]));

  return owned.map((c) => {
    const config = (c.config ?? {}) as CapabilityConfig;
    const cred = credByCapability.get(c.id);
    const meta = (cred?.metadata ?? {}) as { masked_key?: string };
    return {
      id:          c.id,
      slug:        c.slug,
      displayName: c.display_name,
      url:         config.url ?? '',
      hasToken:    config.authKeyType === 'byo_mcp',
      maskedToken: meta.masked_key ?? null,
      connectedAt: c.created_at,
    };
  });
};
