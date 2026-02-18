/**
 * MODL-05: Generic AI provider interface.
 * All provider implementations must satisfy this interface.
 * Adding a new provider means implementing AiProvider — no router changes needed.
 */

export interface CompletionRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  /** Exact OpenRouter model ID (e.g. 'anthropic/claude-opus-4.6') */
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Cost in USD from OpenRouter response.usage.cost */
  costUsd: number;
}

export interface CompletionResponse {
  content: string;
  /** Actual model used (may differ from requested if fallback occurred) */
  model: string;
  usage: CompletionUsage;
}

export interface AiProvider {
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}
