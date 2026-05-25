// Direct fetch wrapper for OpenRouter chat completions. Sticks to the
// OpenAI-compatible POST /api/v1/chat/completions endpoint; the SDK
// abstraction is deferred until a second modality (vision / image gen)
// needs it.

import type { ToolSchema } from './tools/index.ts';

export interface OutgoingToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

// Parts of a multimodal user turn. Today only `text` and `image_url`
// are emitted; OpenAI's spec also allows `input_audio` etc., extend
// as needed. `image_url.url` may be either a `data:` URL (base64) or
// a regular HTTPS URL — we use Supabase Storage signed URLs so the
// LLM provider fetches the bytes directly, skipping our worker.
export type ChatMessageContentPart
  = | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

// Union over the four valid turn shapes. `content` is nullable only on
// assistant turns that exclusively carry `tool_calls`. User turns may
// carry a multimodal array (image + text). `tool_call_id` is
// mandatory on tool turns (OpenAI requires the bridge back to the
// originating call) and forbidden elsewhere.
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null | ChatMessageContentPart[];
  tool_call_id?: string;
  tool_calls?: OutgoingToolCall[];
}

// OpenRouter's usage object — full passthrough. New fields appear
// from upstream (cache_write_tokens, reasoning_tokens, etc.) without
// requiring a wrapper change.
export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost?: number;
  cost_details?: {
    upstream_inference_cost?: number;
  };
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
    audio_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

export interface ToolCall {
  id: string;
  name: string;
  // JSON-encoded args, exactly as the model emitted. Parsed by the
  // tool executor; we don't pre-parse here because the registry needs
  // to handle invalid JSON itself (so the error round-trips to the
  // model as a tool result, not as a thrown exception).
  argumentsJson: string;
}

export interface ChatCompletionResult {
  text: string | null;
  toolCalls: ToolCall[] | null;
  generationId: string;
  model: string;
  finishReason: string;
  costUsd: number;
  usage: ChatCompletionUsage;
}

export class OpenRouterError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

interface RawToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface RawCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: RawToolCall[];
    };
    finish_reason: string;
  }>;
  usage: ChatCompletionUsage;
}

// LINE caps each text message at 5000 chars (~3-4K tokens); 4096
// gives the model headroom for verbose answers without forcing
// OpenRouter to pre-reserve credit for the model's full output ceiling
// (Claude Sonnet 4.5 advertises 64K, which 402s users with small
// balances even though no real reply ever needs that much).
const MAX_REPLY_TOKENS = 4096;

export const chatCompletion = async (params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools?: ToolSchema[];
}): Promise<ChatCompletionResult> => {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    max_tokens: MAX_REPLY_TOKENS,
  };
  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools;
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`,
      // Surfaced in OpenRouter Activity so traffic is attributable.
      'HTTP-Referer': 'https://fermi.tw',
      'X-Title': 'fermi',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new OpenRouterError(res.status, `OpenRouter ${res.status}: ${errBody}`);
  }

  const data: RawCompletionResponse = await res.json();
  const choice = data.choices[0];
  const rawToolCalls = choice?.message?.tool_calls ?? null;
  const toolCalls = rawToolCalls && rawToolCalls.length > 0
    ? rawToolCalls.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      argumentsJson: tc.function.arguments,
    }))
    : null;

  return {
    text: choice?.message?.content ?? null,
    toolCalls,
    generationId: data.id,
    model: data.model,
    finishReason: choice?.finish_reason ?? 'unknown',
    costUsd: data.usage.cost ?? 0,
    usage: data.usage,
  };
};
