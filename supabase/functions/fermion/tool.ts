// One fermion, owner-scoped: every tool takes the resource id as an
// argument (not closed over a bound resource) and MUST scope its query by
// `ownerId` — the LLM can pass any id, so ownership is enforced per tool,
// not by the route.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolSchema } from '../agent/tools/index.ts';

export interface FermionToolContext {
  admin:   SupabaseClient;
  ownerId: string;
}

export interface FermionTool {
  schema: ToolSchema;
  // `changed` (dashboard refetch) fires only when a mutating tool ran.
  mutating?: boolean;
  run: (args: Record<string, unknown>, ctx: FermionToolContext) => Promise<unknown>;
}
