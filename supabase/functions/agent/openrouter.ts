// Direct fetch wrapper for OpenRouter chat completions. Sticks to the
// OpenAI-compatible POST /api/v1/chat/completions endpoint; the SDK
// abstraction is deferred until a second modality (vision / image gen)
// needs it.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
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

export interface ChatCompletionResult {
  text: string;
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

interface RawCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    message: { role: string; content: string | null };
    finish_reason: string;
  }>;
  usage: ChatCompletionUsage;
}

export const chatCompletion = async (params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
}): Promise<ChatCompletionResult> => {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`,
      // Surfaced in OpenRouter Activity so traffic is attributable.
      'HTTP-Referer': 'https://fermi.tw',
      'X-Title': 'fermi',
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new OpenRouterError(res.status, `OpenRouter ${res.status}: ${body}`);
  }

  const data: RawCompletionResponse = await res.json();
  const text = data.choices[0]?.message?.content ?? '';

  return {
    text,
    generationId: data.id,
    model: data.model,
    finishReason: data.choices[0]?.finish_reason ?? 'unknown',
    costUsd: data.usage.cost ?? 0,
    usage: data.usage,
  };
};
