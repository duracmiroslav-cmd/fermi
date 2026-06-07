// switch_mode: the single Tier-1 tool, offered to an agent's master in any
// mode (the worker / invoke gate decides who is master). It flips the agent
// between 'normal', 'maintenance' (write-type management tools), and 'debug'
// (read-only run introspection). One tool with an enum mirrors the single
// `agents.mode` column — not three enter_/exit_ verbs.
//
// Writes the master's CURRENT agent (bound at build), not an id argument:
// the mode that matters is the one gating this conversation. A TTL auto-
// reverts to normal so a forgotten session can't leave tools armed; debug
// is read-only so its window is longer than maintenance's.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Toolset } from '../index.ts';

const MODES = ['normal', 'maintenance', 'debug'] as const;
type Mode = (typeof MODES)[number];

const TTL_MS: Record<Exclude<Mode, 'normal'>, number> = {
  maintenance: 30 * 60 * 1000,
  debug:       2 * 60 * 60 * 1000,
};

const SWITCH_MODE_SCHEMA = {
  type: 'function' as const,
  function: {
    name:        'switch_mode',
    description: 'Switch this assistant\'s mode. "normal" = just chat, no management tools. "maintenance" = also expose tools to edit this assistant, connect providers, and manage bots. "debug" = also expose read-only tools to inspect recent runs and diagnose why a reply failed. Enter maintenance before changing settings; enter debug to investigate errors; return to normal when done. Each non-normal mode auto-reverts after a while.',
    parameters: {
      type:       'object',
      properties: { mode: { type: 'string', enum: [...MODES], description: 'The mode to switch to.' } },
      required:   ['mode'],
      additionalProperties: false,
    },
  },
};

export const buildModeToolset = (ctx: {
  admin:   SupabaseClient;
  ownerId: string;
  agentId: string;
}): Toolset => ({
  schemas: [SWITCH_MODE_SCHEMA],
  execute: async (name: string, argumentsJson: string): Promise<string> => {
    if (name !== 'switch_mode') return JSON.stringify({ error: `Unknown tool: ${name}` });
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argumentsJson) as Record<string, unknown>;
    } catch {
      return JSON.stringify({ error: 'Tool arguments were not valid JSON.' });
    }
    const mode = args.mode;
    if (typeof mode !== 'string' || !(MODES as readonly string[]).includes(mode)) {
      return JSON.stringify({ error: `mode must be one of: ${MODES.join(', ')}.` });
    }
    const modeUntil = mode === 'normal'
      ? null
      : new Date(Date.now() + TTL_MS[mode as Exclude<Mode, 'normal'>]).toISOString();

    const { error: updateErr } = await ctx.admin
      .from('agents')
      .update({ mode, mode_until: modeUntil })
      .eq('id', ctx.agentId)
      .eq('owner_id', ctx.ownerId)
      .is('deleted_at', null);
    if (updateErr) return JSON.stringify({ error: `Tool execution failed: ${String(updateErr.message)}` });

    return JSON.stringify({ ok: true, mode, expires_at: modeUntil });
  },
});
