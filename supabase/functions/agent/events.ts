import type { SupabaseClient } from '@supabase/supabase-js';

export type EventType
  = | 'worker_started'
    | 'llm_request'
    | 'llm_response'
    | 'push_sent'
    | 'push_failed'
    | 'error';

export interface LogEventInput {
  conversationId: string;
  threadId?: string | null;
  step: number;
  type: EventType;
  payload?: Record<string, unknown>;
  latencyMs?: number;
  costUsd?: number;
  openrouterGenId?: string;
}

// Fail-open: a failed log insert must never break the agent loop.
// Errors land in console.error for ops to chase later.
export const logEvent = async (
  admin: SupabaseClient,
  input: LogEventInput,
): Promise<void> => {
  try {
    const { error } = await admin.from('agent_events').insert({
      conversation_id: input.conversationId,
      thread_id: input.threadId ?? null,
      step: input.step,
      type: input.type,
      payload: input.payload ?? {},
      latency_ms: input.latencyMs ?? null,
      cost_usd: input.costUsd ?? null,
      openrouter_gen_id: input.openrouterGenId ?? null,
    });
    if (error) {
      console.error('agent_events insert failed', { error, type: input.type, step: input.step });
    }
  } catch (err) {
    console.error('agent_events log threw', err);
  }
};
