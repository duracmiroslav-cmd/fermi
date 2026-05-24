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

// Opens a new run on a thread and returns its id. The run starts in
// `status='running'`; the caller is expected to flip it to
// `succeeded` / `failed` via finishRun once the loop ends.
export const startRun = async (
  admin: SupabaseClient,
  threadId: string,
): Promise<string> => {
  const { data, error } = await admin
    .from('agent_runs')
    .insert({ thread_id: threadId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
};

// Closes a run. `totalCostUsd` is the sum of all step costs the
// caller accumulated; we trust the caller's tally rather than
// re-querying. Idempotent enough — a second call just overwrites
// status/cost/finished_at.
export const finishRun = async (
  admin: SupabaseClient,
  runId: string,
  status: RunStatus,
  totalCostUsd: number,
): Promise<void> => {
  const { error } = await admin
    .from('agent_runs')
    .update({
      status,
      total_cost_usd: totalCostUsd,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);
  if (error) {
    // Fail-open: a missed finish leaves the run as `running` forever,
    // visible in the admin viewer as a dangling row. Acceptable.
    console.error('agent_runs finish failed', { runId, status, error });
  }
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
