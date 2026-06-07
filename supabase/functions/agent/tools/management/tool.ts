// The management toolset, owner-scoped: every tool takes the resource id as
// an argument (not closed over a bound resource) and MUST scope its query by
// `ownerId` — the LLM can pass any id, so ownership is enforced per tool,
// not by the caller. Armed only for an agent's master while it is in
// maintenance mode (the worker / invoke gate), never for an end-user.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolSchema } from '../index.ts';

export interface ManagementToolContext {
  admin:   SupabaseClient;
  ownerId: string;
}

export interface ManagementTool {
  schema: ToolSchema;
  // `changed` (dashboard refetch) fires only when a mutating tool ran.
  mutating?: boolean;
  // Needs a browser surface (secure credential form / OAuth redirect / QR).
  // On LINE there is no widget to render, so the toolset returns a "finish in
  // the dashboard" pointer instead of running it (see buildManagementToolset).
  webOnly?: boolean;
  // Dashboard path the LINE guidance links to. Required for webOnly tools.
  linkPath?: (args: Record<string, unknown>) => string;
  run: (args: Record<string, unknown>, ctx: ManagementToolContext) => Promise<unknown>;
}
