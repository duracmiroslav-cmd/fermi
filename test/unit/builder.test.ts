import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { buildBuilderToolset, builderSystemPrompt } from '../../supabase/functions/fermion/agent';

// In-memory model of the rows + RPCs the builder tools touch, so the
// set_capabilities diff (attach desired, detach removed, ignore unknown
// slugs) and update_agent validation are tested behaviorally.

interface Cap { id: string; slug: string }
interface Sink {
  patch?: Record<string, string>;
  rpc:    Array<{ name: string; args: Record<string, unknown> }>;
}

const chain = (value: unknown) => {
  const c: Record<string, unknown> = {
    eq:   () => c,
    is:   () => c,
    then: (resolve: (v: unknown) => void) => resolve(value),
  };
  return c;
};

const makeAdmin = (builtinCaps: Cap[], currentAttached: Array<{ capability_id: string }>, sink: Sink): SupabaseClient =>
  ({
    from: (table: string) => ({
      update: (patch: Record<string, string>) => {
        sink.patch = patch;
        return chain({ error: null });
      },
      select: () => chain(
        table === 'capabilities'
          ? { data: builtinCaps, error: null }
          : { data: currentAttached, error: null },
      ),
    }),
    rpc: (name: string, args: Record<string, unknown>) => {
      sink.rpc.push({ name, args });
      return Promise.resolve({ error: null });
    },
  }) as unknown as SupabaseClient;

const exec = (toolset: ReturnType<typeof buildBuilderToolset>, name: string, args: unknown) =>
  toolset.execute(name, JSON.stringify(args), {} as never);

describe('builderSystemPrompt', () => {
  it('injects the current config so the builder edits in place', () => {
    const prompt = builderSystemPrompt({
      name:            'Cafe Host',
      systemPrompt:    'You are a warm cafe host.',
      capabilitySlugs: ['time', 'web-search'],
    });
    expect(prompt).toContain('Cafe Host');
    expect(prompt).toContain('You are a warm cafe host.');
    expect(prompt).toContain('time, web-search');
  });

  it('marks an unconfigured agent as starting from scratch', () => {
    const prompt = builderSystemPrompt({ name: 'My agent', systemPrompt: null, capabilitySlugs: [] });
    expect(prompt).toContain('(none yet)');
    expect(prompt).toContain('(none)');
  });
});

describe('builder update_agent', () => {
  it('writes name and system_prompt', async () => {
    const sink: Sink = { rpc: [] };
    const ts = buildBuilderToolset(makeAdmin([], [], sink), 'owner1', 'agent1');
    const out = JSON.parse(await exec(ts, 'update_agent', { name: 'Cafe Host', system_prompt: 'You are a host.' }));
    expect(out.ok).toBe(true);
    expect(sink.patch).toEqual({ name: 'Cafe Host', system_prompt: 'You are a host.' });
  });

  it('rejects an empty update without writing', async () => {
    const sink: Sink = { rpc: [] };
    const ts = buildBuilderToolset(makeAdmin([], [], sink), 'owner1', 'agent1');
    const out = JSON.parse(await exec(ts, 'update_agent', {}));
    expect(out.error).toBeTruthy();
    expect(sink.patch).toBeUndefined();
  });
});

describe('builder set_capabilities', () => {
  const builtins: Cap[] = [
    { id: 't', slug: 'time' },
    { id: 'w', slug: 'web-search' },
    { id: 'f', slug: 'web-fetch' },
  ];

  it('attaches the desired, detaches the removed, ignores unknown slugs', async () => {
    const sink: Sink = { rpc: [] };
    // Currently attached: time. Desired: web-search (+ a bogus slug).
    const ts = buildBuilderToolset(makeAdmin(builtins, [{ capability_id: 't' }], sink), 'owner1', 'agent1');
    const out = JSON.parse(await exec(ts, 'set_capabilities', { slugs: ['web-search', 'bogus'] }));

    expect(out.ok).toBe(true);
    expect(out.enabled).toEqual(['web-search']); // bogus dropped

    const attaches = sink.rpc.filter(c => c.name === 'attach_capability').map(c => c.args.p_capability_id);
    const detaches = sink.rpc.filter(c => c.name === 'detach_capability').map(c => c.args.p_capability_id);
    expect(attaches).toEqual(['w']);
    expect(detaches).toEqual(['t']);
  });

  it('no-ops when the desired set already matches', async () => {
    const sink: Sink = { rpc: [] };
    const ts = buildBuilderToolset(makeAdmin(builtins, [{ capability_id: 'w' }], sink), 'owner1', 'agent1');
    await exec(ts, 'set_capabilities', { slugs: ['web-search'] });
    expect(sink.rpc).toHaveLength(0);
  });
});
