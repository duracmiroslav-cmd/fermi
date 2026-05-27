// Minimal MCP client over Streamable HTTP (JSON-RPC 2.0). Deno/edge-friendly,
// zero dependencies. Covers only the subset fermi needs: initialize,
// tools/list, tools/call. We hand-roll this instead of pulling
// @modelcontextprotocol/sdk because the SDK drags ~14MB of server/stdio deps
// (express, hono, ajv, cross-spawn) into the edge bundle even on the client
// path; the wire protocol we need is a few JSON-RPC calls.
//
// A Streamable HTTP server may answer a POST with either a single
// `application/json` body or a `text/event-stream` SSE frame; both are
// handled. Sessions are optional: we capture `Mcp-Session-Id` if the server
// issues one on initialize and echo it, but don't require it (stateless OK).

const PROTOCOL_VERSION = '2025-06-18';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export interface McpClientOptions {
  url: string;
  // Bearer token (e.g. a GitHub PAT). Omit for unauthenticated servers.
  token?: string;
  clientName?: string;
  timeoutMs?: number;
}

export class McpClient {
  #url: string;
  #token?: string;
  #sessionId?: string;
  #protocolVersion = PROTOCOL_VERSION;
  #nextId = 1;
  #timeoutMs: number;
  #clientName: string;

  constructor(opts: McpClientOptions) {
    this.#url = opts.url;
    this.#token = opts.token;
    this.#timeoutMs = opts.timeoutMs ?? 15000;
    this.#clientName = opts.clientName ?? 'fermi';
  }

  // Handshake: initialize, adopt the server's negotiated protocol version and
  // session id, then send the required `initialized` notification.
  async connect(): Promise<void> {
    const res = await this.#request('initialize', {
      protocolVersion: this.#protocolVersion,
      capabilities: {},
      clientInfo: { name: this.#clientName, version: '1.0.0' },
    }, true);
    const result = res as { protocolVersion?: string };
    if (result?.protocolVersion) this.#protocolVersion = result.protocolVersion;
    await this.#notify('notifications/initialized');
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.#request('tools/list') as { tools?: McpTool[] };
    return result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
    return await this.#request('tools/call', { name, arguments: args }) as McpToolResult;
  }

  #headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'MCP-Protocol-Version': this.#protocolVersion,
    };
    if (this.#token) h['Authorization'] = `Bearer ${this.#token}`;
    if (this.#sessionId) h['Mcp-Session-Id'] = this.#sessionId;
    return h;
  }

  async #request(method: string, params?: unknown, captureSession = false): Promise<unknown> {
    const id = this.#nextId++;
    const body: JsonRpcRequest = { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) };
    const res = await fetch(this.#url, {
      method: 'POST',
      headers: this.#headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (captureSession) {
      const sid = res.headers.get('mcp-session-id');
      if (sid) this.#sessionId = sid;
    }
    if (!res.ok) {
      throw new Error(`MCP HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const message = await this.#readMessage(res, id);
    if (message.error) throw new Error(`MCP error ${message.error.code}: ${message.error.message}`);
    return message.result;
  }

  // Notifications carry no id and expect no response (202 Accepted, empty body).
  async #notify(method: string): Promise<void> {
    const res = await fetch(this.#url, {
      method: 'POST',
      headers: this.#headers(),
      body: JSON.stringify({ jsonrpc: '2.0', method }),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    await res.body?.cancel();
  }

  async #readMessage(res: Response, id: number): Promise<JsonRpcResponse> {
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/event-stream')) {
      const text = await res.text();
      // SSE frames are separated by blank lines; pull the `data:` payload
      // whose JSON-RPC id matches our request.
      for (const frame of text.split('\n\n')) {
        const data = frame.split('\n')
          .filter(l => l.startsWith('data:'))
          .map(l => l.slice(5).trim())
          .join('\n');
        if (!data) continue;
        try {
          const msg = JSON.parse(data) as JsonRpcResponse;
          if (msg.id === id) return msg;
        } catch {
          // Non-JSON or partial frame; skip.
        }
      }
      throw new Error('MCP: no matching JSON-RPC response in SSE stream');
    }
    return await res.json() as JsonRpcResponse;
  }
}
