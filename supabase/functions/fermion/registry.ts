// fermion serves one assistant across many dashboard surfaces. Each
// surface is a target: it resolves the resource being configured into a
// system prompt (current config injected) + a toolset whose mutations
// stay scoped to that resource. Adding a surface is one entry here, not a
// new Edge Function — the handler in index.ts is target-agnostic.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Toolset } from '../agent/tools/index.ts';
import { agentTarget } from './agent.ts';
import { botTarget } from './bot.ts';

export interface ResolvedTarget {
  ownerId:      string;
  systemPrompt: string;
  toolset:      Toolset;
}

export interface FermionTarget {
  // null when the resource doesn't exist (the owner check is the caller's
  // job; this trusts the id it's handed).
  resolve:       (admin: SupabaseClient, id: string) => Promise<ResolvedTarget | null>;
  // Tool names whose calls mean the resource actually changed, so the
  // dashboard refetches only when one of these fired (not every turn).
  mutatingTools: readonly string[];
}

export const TARGETS: Record<string, FermionTarget> = {
  agent: agentTarget,
  bot:   botTarget,
};
