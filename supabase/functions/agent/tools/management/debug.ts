// Debug toolset (Tier 2b, armed only for an agent's master in debug mode):
// read-only introspection over the observability tables so the master can
// ask the agent why a reply failed — the in-channel substitute for a run
// viewer UI, and the only such surface on LINE.
//
// PRIVACY / INJECTION: these tools return a DIAGNOSTIC PROJECTION, never the
// raw `agent_run_steps.payload`. Payloads carry end-user message text, tool
// arguments, and error stacks; echoing them would let "debug" read every
// end-user's conversation and re-feed untrusted tool output to the model.
// Token/model/cost come from dedicated columns; only a whitelisted, truncated
// slice of each payload (error message, tool name, push status) is surfaced.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Toolset } from '../index.ts';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const ERROR_MAX_CHARS = 200;

interface DebugContext {
  admin:   SupabaseClient;
  ownerId: string;
  // The conversation's bot, when there is one (none yet on the web console
  // for a freshly-made agent). Default run scope; falls back to agentId.
  botId:   string | null;
  agentId: string;
}

interface RunRow {
  id:             string;
  status:         string;
  error_code:     string | null;
  total_cost_usd: number | string;
  created_at:     string;
  finished_at:    string | null;
}

interface StepRow {
  step:              number;
  type:              string;
  model:             string | null;
  prompt_tokens:     number | null;
  completion_tokens: number | null;
  cached_tokens:     number | null;
  latency_ms:        number | null;
  cost_usd:          number | string | null;
  payload:           Record<string, unknown>;
}

const truncate = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  return value.length > ERROR_MAX_CHARS ? `${value.slice(0, ERROR_MAX_CHARS)}…` : value;
};

const undef = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

const summarizeRun = (r: RunRow): Record<string, unknown> => ({
  id:          r.id,
  status:      r.status,
  error_code:  undef(r.error_code),
  cost_usd:    Number(r.total_cost_usd),
  started_at:  r.created_at,
  finished_at: undef(r.finished_at),
  duration_ms: r.finished_at ? new Date(r.finished_at).getTime() - new Date(r.created_at).getTime() : undefined,
});

// Whitelisted per-type projection — never the raw payload. Each `type` reads
// only the keys safe to surface (no user/assistant content, no tool args).
const projectStep = (s: StepRow): Record<string, unknown> => {
  const base: Record<string, unknown> = { step: s.step, type: s.type };
  if (s.latency_ms != null) base.latency_ms = s.latency_ms;
  if (s.cost_usd != null) base.cost_usd = Number(s.cost_usd);
  switch (s.type) {
    case 'llm_responded':
      if (s.model) base.model = s.model;
      if (s.prompt_tokens != null) base.prompt_tokens = s.prompt_tokens;
      if (s.completion_tokens != null) base.completion_tokens = s.completion_tokens;
      if (s.cached_tokens != null) base.cached_tokens = s.cached_tokens;
      break;
    case 'tool_called':
      base.tool = undef(s.payload.name as string | undefined);
      break;
    case 'push_succeeded':
      base.method = undef(s.payload.method as string | undefined);
      break;
    case 'push_failed':
      base.method = undef(s.payload.method as string | undefined);
      base.status = undef(s.payload.status as number | undefined);
      break;
    case 'error_occurred':
      base.error  = truncate(s.payload.message);
      base.status = undef(s.payload.status as number | undefined);
      break;
  }
  return base;
};

const RUN_COLS = 'id, status, error_code, total_cost_usd, created_at, finished_at';
const STEP_COLS = 'step, type, model, prompt_tokens, completion_tokens, cached_tokens, latency_ms, cost_usd, payload';

const loadSteps = async (ctx: DebugContext, runId: string): Promise<Record<string, unknown>[]> => {
  const { data: steps, error: stepErr } = await ctx.admin
    .from('agent_run_steps')
    .select(STEP_COLS)
    .eq('run_id', runId)
    .order('step', { ascending: true });
  if (stepErr) throw stepErr;
  return ((steps ?? []) as StepRow[]).map(projectStep);
};

const listRecentRuns = async (args: Record<string, unknown>, ctx: DebugContext): Promise<unknown> => {
  const limit = Math.min(typeof args.limit === 'number' ? args.limit : DEFAULT_LIMIT, MAX_LIMIT);
  const targetBot = typeof args.bot_id === 'string' ? args.bot_id : ctx.botId;
  let q = ctx.admin
    .from('agent_runs')
    .select(RUN_COLS)
    .eq('owner_id', ctx.ownerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  q = targetBot ? q.eq('bot_id', targetBot) : q.eq('agent_id', ctx.agentId);
  if (typeof args.status === 'string') q = q.eq('status', args.status);
  const { data: runs, error: runErr } = await q;
  if (runErr) throw runErr;
  return { runs: ((runs ?? []) as RunRow[]).map(summarizeRun) };
};

const getRun = async (args: Record<string, unknown>, ctx: DebugContext): Promise<unknown> => {
  if (typeof args.run_id !== 'string') return { error: 'Pass run_id (from list_recent_runs).' };
  const { data: run, error: runErr } = await ctx.admin
    .from('agent_runs')
    .select(RUN_COLS)
    .eq('id', args.run_id)
    .eq('owner_id', ctx.ownerId)
    .maybeSingle();
  if (runErr) throw runErr;
  if (!run) return { error: 'No run with that id (or it isn\'t yours).' };
  return { run: summarizeRun(run as RunRow), steps: await loadSteps(ctx, args.run_id) };
};

const getLastFailure = async (_args: Record<string, unknown>, ctx: DebugContext): Promise<unknown> => {
  let q = ctx.admin
    .from('agent_runs')
    .select(RUN_COLS)
    .eq('owner_id', ctx.ownerId)
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(1);
  q = ctx.botId ? q.eq('bot_id', ctx.botId) : q.eq('agent_id', ctx.agentId);
  const { data: runs, error: runErr } = await q;
  if (runErr) throw runErr;
  const run = (runs ?? [])[0] as RunRow | undefined;
  if (!run) return { none: true, message: 'No failed runs found.' };
  return { run: summarizeRun(run), steps: await loadSteps(ctx, run.id) };
};

const HANDLERS: Record<string, (a: Record<string, unknown>, c: DebugContext) => Promise<unknown>> = {
  list_recent_runs: listRecentRuns,
  get_run:          getRun,
  get_last_failure: getLastFailure,
};

const SCHEMAS = [
  {
    type: 'function' as const,
    function: {
      name:        'list_recent_runs',
      description: 'List recent agent runs for diagnosis: id, status (succeeded/failed/running), error category, cost, timing. Defaults to this bot\'s runs. Use to spot which recent replies failed, then get_run for the timeline.',
      parameters: {
        type:       'object',
        properties: {
          status: { type: 'string', enum: ['failed', 'succeeded', 'running'], description: 'Only runs with this status.' },
          limit:  { type: 'number', description: `How many to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).` },
        },
        required:             [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name:        'get_run',
      description: 'Get the step-by-step timeline of one run (LLM calls, tool calls, push attempts, errors) to see where it broke. Returns diagnostics only — models, tokens, timings, error categories — never the conversation text.',
      parameters: {
        type:       'object',
        properties: { run_id: { type: 'string', description: 'The run id from list_recent_runs.' } },
        required:             ['run_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name:        'get_last_failure',
      description: 'Jump straight to the most recent failed run for this bot and return its timeline. The fastest way to answer "why did it just break?".',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
];

// Overlay appended to the agent's persona while in debug mode.
export const debugPreamble = (): string =>
  `You are now in DEBUG MODE. Beyond your normal role, you can inspect this assistant's recent runs to diagnose problems: list_recent_runs shows which replies failed, get_run gives a run's step-by-step timeline, get_last_failure jumps to the latest failure. Explain what went wrong in plain language — a failed step, an error category, a slow tool. You see diagnostics only (models, tokens, timings, error categories), never the conversation text. If a fix is needed, offer to switch to maintenance mode (switch_mode) to make it. Write plain text, no Markdown.`;

export const buildDebugToolset = (ctx: DebugContext): Toolset => ({
  schemas: SCHEMAS,
  execute: async (name: string, argumentsJson: string): Promise<string> => {
    const handler = HANDLERS[name];
    if (!handler) return JSON.stringify({ error: `Unknown tool: ${name}` });
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argumentsJson) as Record<string, unknown>;
    } catch {
      return JSON.stringify({ error: 'Tool arguments were not valid JSON.' });
    }
    try {
      return JSON.stringify(await handler(args, ctx));
    } catch (err) {
      return JSON.stringify({ error: `Tool execution failed: ${String(err)}` });
    }
  },
});
