import type { SupabaseClient } from '@supabase/supabase-js';

export type StepType
  = | 'llm_requested'
    | 'llm_responded'
    | 'tool_called'
    | 'tool_responded'
    | 'push_succeeded'
    | 'push_failed'
    | 'error_occurred';

export type RunStatus = 'running' | 'succeeded' | 'failed';

export interface LogStepInput {
  runId: string;
  step: number;
  type: StepType;
  payload?: Record<string, unknown>;
  latencyMs?: number;
  costUsd?: number;
  openrouterGenId?: string;
}

// Opens a new run on a thread and returns its id. Snapshot ids
// (bot_id / agent_id / owner_id) freeze the run's attribution at
// creation time, so later edits to the bot's agent binding don't
// rewrite history. The `agent_runs_fill_snapshot` trigger backstops
// any caller that forgets them. The run starts in `status='running'`;
// the caller is expected to flip it to `succeeded` / `failed` via
// finishRun once the loop ends.
export const startRun = async (
  admin: SupabaseClient,
  input: { threadId: string; botId: string; agentId: string; ownerId: string },
): Promise<string> => {
  const { data: run, error: runErr } = await admin
    .from('agent_runs')
    .insert({
      thread_id: input.threadId,
      bot_id:    input.botId,
      agent_id:  input.agentId,
      owner_id:  input.ownerId,
    })
    .select('id')
    .single();
  if (runErr) throw runErr;
  return run.id;
};

// Closes a run. `totalCostUsd` is the sum of all step costs the
// caller accumulated; we trust the caller's tally rather than
// re-querying. `errorCode` only matters when status === 'failed';
// pass it via deriveErrorCode to keep buckets in sync with the
// SQL backfill. Idempotent enough, a second call just overwrites
// status/cost/finished_at/error_code.
export const finishRun = async (
  admin: SupabaseClient,
  runId: string,
  status: RunStatus,
  totalCostUsd: number,
  errorCode?: string,
): Promise<void> => {
  const { error: finishErr } = await admin
    .from('agent_runs')
    .update({
      status,
      total_cost_usd: totalCostUsd,
      finished_at: new Date().toISOString(),
      ...(errorCode !== undefined ? { error_code: errorCode } : {}),
    })
    .eq('id', runId);
  if (finishErr) {
    // Fail-open: a missed finish leaves the run as `running` forever,
    // visible in the admin viewer as a dangling row. Acceptable.
    console.error('agent_runs finish failed', { runId, status, error: finishErr });
  }
};

// Maps an HTTP status (from OpenRouter / LINE failures) to the bucket
// written to `agent_runs.error_code`. Past-verb form matches the
// `agent_run_steps.type` convention (`error_occurred`, `push_failed`).
// Mirrors the SQL backfill in 20260525060000_add_agent_runs_error_code.sql
//, keep the two in sync.
export const deriveErrorCode = (status: number | undefined): string => {
  if (status === 429) return 'rate_limited';
  if (status === 408 || status === 504) return 'timed_out';
  if (status !== undefined && status >= 500 && status < 600) return 'upstream_failed';
  return 'unknown';
};

// Fail-open: a failed step insert must never break the agent loop.
// Errors land in console.error for ops to chase later.
export const logStep = async (
  admin: SupabaseClient,
  input: LogStepInput,
): Promise<void> => {
  try {
    const { error } = await admin.from('agent_run_steps').insert({
      run_id: input.runId,
      step: input.step,
      type: input.type,
      payload: input.payload ?? {},
      latency_ms: input.latencyMs ?? null,
      cost_usd: input.costUsd ?? null,
      openrouter_gen_id: input.openrouterGenId ?? null,
    });
    if (error) {
      console.error('agent_run_steps insert failed', { error, type: input.type, step: input.step });
    }
  } catch (err) {
    console.error('agent_run_steps log threw', err);
  }
};
