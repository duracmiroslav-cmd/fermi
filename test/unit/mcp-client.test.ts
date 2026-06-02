import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpClient } from '../../supabase/functions/agent/tools/mcp/client';
import type { DnsResolver } from '../../supabase/functions/agent/tools/safe-http';

// Hermetic stand-in for a Streamable HTTP MCP server: global fetch is
// stubbed to answer JSON-RPC requests from a handler. The real protocol
// interop (DeepWiki / GitMCP, incl. version negotiation and tool calls) is
// exercised manually against the live servers; these tests pin the client's
// own guarantees — pagination cap, SSE vs JSON decode, error propagation,
// and the connect-time SSRF guard — without a network.

interface RpcReply { result?: unknown; error?: { code: number; message: string } }
type Handler = (method: string, id: number) => RpcReply;

let lastHeaders: Record<string, string> = {};

const installFetch = (handler: Handler, opts: { sse?: boolean } = {}): void => {
  vi.stubGlobal('fetch', vi.fn((_url: string, init: { body: string; headers: Record<string, string> }) => {
    lastHeaders = init.headers;
    const req = JSON.parse(init.body) as { id?: number; method: string };
    // Notifications (no id) get a bodyless 202, like a real server.
    if (req.id === undefined) return Promise.resolve(new Response(null, { status: 202 }));
    const payload = JSON.stringify({ jsonrpc: '2.0', id: req.id, ...handler(req.method, req.id) });
    const headers = { 'content-type': opts.sse ? 'text/event-stream' : 'application/json' };
    const body = opts.sse ? `event: message\ndata: ${payload}\n\n` : payload;
    return Promise.resolve(new Response(body, { status: 200, headers }));
  }));
};

const publicResolver: DnsResolver = () => Promise.resolve(['93.184.216.34']);
const tool = (name: string) => ({ name, inputSchema: {} });

afterEach(() => vi.unstubAllGlobals());

describe('McpClient.connect SSRF guard', () => {
  it('blocks a literal private host before any request', async () => {
    installFetch(() => ({ result: {} }));
    const c = new McpClient({ url: 'http://127.0.0.1/mcp' });
    await expect(c.connect()).rejects.toThrow('Blocked host');
  });

  it('blocks a host that resolves to a private address', async () => {
    installFetch(() => ({ result: {} }));
    const c = new McpClient({ url: 'https://evil.test/mcp', resolve: () => Promise.resolve(['10.0.0.1']) });
    await expect(c.connect()).rejects.toThrow('private');
  });

  it('connects through a public host and adopts the server protocol version', async () => {
    installFetch(method => method === 'initialize'
      ? { result: { protocolVersion: '2025-03-26', capabilities: {} } }
      : { result: {} });
    const c = new McpClient({ url: 'https://mcp.example/mcp', resolve: publicResolver });
    await c.connect();
    // The post-initialize `notifications/initialized` carries the negotiated
    // version, proving the client switched off its own default.
    expect(lastHeaders['MCP-Protocol-Version']).toBe('2025-03-26');
  });
});

describe('McpClient.listTools', () => {
  it('aggregates tools across paginated cursors', async () => {
    let page = 0;
    installFetch(() => ({ result: ++page === 1
      ? { tools: [tool('a')], nextCursor: 'c1' }
      : { tools: [tool('b')] } }));
    const c = new McpClient({ url: 'https://mcp.example/mcp' });
    const tools = await c.listTools();
    expect(tools.map(t => t.name)).toEqual(['a', 'b']);
  });

  it('caps pagination so an endless nextCursor cannot drain the budget', async () => {
    installFetch(() => ({ result: { tools: [tool('t')], nextCursor: 'always' } }));
    const c = new McpClient({ url: 'https://mcp.example/mcp' });
    await expect(c.listTools()).rejects.toThrow(/exceeded \d+ pages/);
  });

  it('decodes an SSE (text/event-stream) response', async () => {
    installFetch(() => ({ result: { tools: [tool('sse-tool')] } }), { sse: true });
    const c = new McpClient({ url: 'https://mcp.example/mcp' });
    const tools = await c.listTools();
    expect(tools.map(t => t.name)).toEqual(['sse-tool']);
  });
});

describe('McpClient.callTool', () => {
  it('returns the tool result content', async () => {
    installFetch(() => ({ result: { content: [{ type: 'text', text: 'hello' }] } }));
    const c = new McpClient({ url: 'https://mcp.example/mcp' });
    const r = await c.callTool('echo', { say: 'hi' });
    expect(r.content).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('propagates a JSON-RPC error as a thrown error', async () => {
    installFetch(() => ({ error: { code: -32602, message: 'Invalid arguments' } }));
    const c = new McpClient({ url: 'https://mcp.example/mcp' });
    await expect(c.callTool('echo', {})).rejects.toThrow('MCP error -32602');
  });
});
