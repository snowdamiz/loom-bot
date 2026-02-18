import type {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

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

/**
 * Request for a tool-calling completion.
 * Uses the proper OpenAI message param types which support tool_call messages.
 */
export interface ToolCompletionRequest {
  messages: ChatCompletionMessageParam[];
  /** Exact OpenRouter model ID (e.g. 'anthropic/claude-opus-4.6') */
  model: string;
  tools: ChatCompletionTool[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * Response from a tool-calling completion.
 * Returns the full ChatCompletionMessage so callers can inspect tool_calls.
 */
export interface ToolCompletionResponse {
  /** Full message object including content and/or tool_calls */
  message: ChatCompletionMessage;
  /** Why the model stopped generating ('tool_calls', 'stop', etc.) */
  finishReason: string;
  /** Actual model used */
  model: string;
  usage: CompletionUsage;
}

export interface AiProvider {
  complete(req: CompletionRequest): Promise<CompletionResponse>;
  completeWithTools(req: ToolCompletionRequest): Promise<ToolCompletionResponse>;
}
