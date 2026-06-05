import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { agentTools } from '../../supabase/functions/fermion/agent';
import { fermionSystemPrompt } from '../../supabase/functions/fermion/prompt';
import type { AccountState } from '../../supabase/functions/fermion/state';

// In-memory model of the rows + RPCs the agent tools touch, so the
// ownership guard, update_agent validation, and the set_capabilities diff
// (attach desired, detach removed, ignore unknown slugs) are tested
// behaviorally.

interface Cap { id: string; slug: string }
interface Sink {
  patch?: Record<string, string>;
  rpc:    Array<{ name: string; args: Record<string, unknown> }>;
}

const chain = (value: unknown) => {
  const c: Record<string, unknown> = {
    eq:          () => c,
    is:          () => c,
    order:       () => c,
    maybeSingle: () => Promise.resolve(value),
    then:        (resolve: (v: unknown) => void) => resolve(value),
  };
  return c;
};

const makeAdmin = (opts: {
  agentOwned?:      boolean;
  builtinCaps?:     Cap[];
  currentAttached?: Array<{ capability_id: string }>;
  sink:             Sink;
}): SupabaseClient => {
  const { agentOwned = true, builtinCaps = [], currentAttached = [], sink } = opts;
  return ({
    from: (table: string) => ({
      update: (patch: Record<string, string>) => {
        sink.patch = patch;
        return chain({ error: null });
      },
      select: () => chain(
        table === 'agents'
          ? { data: agentOwned ? { id: 'agent1' } : null, error: null }
          : table === 'capabilities'
            ? { data: builtinCaps, error: null }
            : { data: currentAttached, error: null },
      ),
    }),
    rpc: (name: string, args: Record<string, unknown>) => {
      sink.rpc.push({ name, args });
      return Promise.resolve({ error: null });
    },
  }) as unknown as SupabaseClient;
};

const run = (admin: SupabaseClient, name: string, args: Record<string, unknown>): Promise<{ ok?: boolean; error?: string; enabled?: string[] }> => {
  const tool = agentTools.find(t => t.schema.function.name === name);
  if (!tool) throw new Error(`no such tool: ${name}`);
  return tool.run(args, { admin, ownerId: 'owner1' }) as Promise<{ ok?: boolean; error?: string; enabled?: string[] }>;
};

describe('fermionSystemPrompt', () => {
  const state: AccountState = {
    agents:    [{ id: 'a1', name: 'Cafe Host' }],
    bots:      [{ id: 'b1', name: 'My OA', status: 'active', webhookVerified: true, hasReplied: false }],
    connected: new Set(['openrouter']),
  };

  it('maps the account so fermion can act by id', () => {
    const prompt = fermionSystemPrompt(state);
    expect(prompt).toContain('Cafe Host (a1)');
    expect(prompt).toContain('My OA (b1)');
    expect(prompt).toContain('OpenRouter (required) ✓');
  });

  it('adds a context hint for the page being viewed', () => {
    const prompt = fermionSystemPrompt(state, { agentId: 'a1' });
    expect(prompt).toContain('currently looking at the agent "Cafe Host"');
  });
});

describe('update_agent', () => {
  it('writes name and system_prompt for an owned agent', async () => {
    const sink: Sink = { rpc: [] };
    const out = await run(makeAdmin({ sink }), 'update_agent', { agent_id: 'agent1', name: 'Cafe Host', system_prompt: 'You are a host.' });
    expect(out.ok).toBe(true);
    expect(sink.patch).toEqual({ name: 'Cafe Host', system_prompt: 'You are a host.' });
  });

  it('rejects an update with no fields beyond agent_id', async () => {
    const sink: Sink = { rpc: [] };
    const out = await run(makeAdmin({ sink }), 'update_agent', { agent_id: 'agent1' });
    expect(out.error).toBeTruthy();
    expect(sink.patch).toBeUndefined();
  });

  it('refuses an agent the owner does not own, without writing', async () => {
    const sink: Sink = { rpc: [] };
    const out = await run(makeAdmin({ agentOwned: false, sink }), 'update_agent', { agent_id: 'someone-elses', name: 'x' });
    expect(out.error).toBeTruthy();
    expect(sink.patch).toBeUndefined();
  });
});

describe('set_capabilities', () => {
  const builtins: Cap[] = [
    { id: 't', slug: 'time' },
    { id: 'w', slug: 'web-search' },
    { id: 'f', slug: 'web-fetch' },
  ];

  it('attaches the desired, detaches the removed, ignores unknown slugs', async () => {
    const sink: Sink = { rpc: [] };
    const admin = makeAdmin({ builtinCaps: builtins, currentAttached: [{ capability_id: 't' }], sink });
    const out = await run(admin, 'set_capabilities', { agent_id: 'agent1', slugs: ['web-search', 'bogus'] });

    expect(out.ok).toBe(true);
    expect(out.enabled).toEqual(['web-search']); // bogus dropped

    const attaches = sink.rpc.filter(c => c.name === 'attach_capability').map(c => c.args.p_capability_id);
    const detaches = sink.rpc.filter(c => c.name === 'detach_capability').map(c => c.args.p_capability_id);
    expect(attaches).toEqual(['w']);
    expect(detaches).toEqual(['t']);
  });

  it('no-ops when the desired set already matches', async () => {
    const sink: Sink = { rpc: [] };
    const admin = makeAdmin({ builtinCaps: builtins, currentAttached: [{ capability_id: 'w' }], sink });
    await run(admin, 'set_capabilities', { agent_id: 'agent1', slugs: ['web-search'] });
    expect(sink.rpc).toHaveLength(0);
  });

  it('refuses an agent the owner does not own', async () => {
    const sink: Sink = { rpc: [] };
    const admin = makeAdmin({ agentOwned: false, builtinCaps: builtins, sink });
    const out = await run(admin, 'set_capabilities', { agent_id: 'someone-elses', slugs: ['web-search'] });
    expect(out.error).toBeTruthy();
    expect(sink.rpc).toHaveLength(0);
  });
});
