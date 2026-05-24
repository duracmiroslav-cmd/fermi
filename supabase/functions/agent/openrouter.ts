// Direct fetch wrapper for OpenRouter chat completions. Sticks to the
// OpenAI-compatible POST /api/v1/chat/completions endpoint; the SDK
// abstraction is deferred until a second modality (vision / image gen)
// needs it.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ChatCompletionResult {
  text: string;
  generationId: string;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
  model: string;
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
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    cost?: number;
  };
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
    costUsd: data.usage.cost ?? 0,
    promptTokens: data.usage.prompt_tokens,
    completionTokens: data.usage.completion_tokens,
    model: data.model,
  };
};
