import OpenAI from 'openai';
import type {
  AiProvider,
  CompletionRequest,
  CompletionResponse,
  ToolCompletionRequest,
  ToolCompletionResponse,
} from './provider.js';

/**
 * MODL-05: OpenRouter provider implementation.
 * Uses the openai SDK pointed at https://openrouter.ai/api/v1.
 * OpenRouter handles provider-level failover internally for each model ID.
 */
export class OpenRouterProvider implements AiProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://jarvis.internal',
        'X-Title': 'Jarvis Agent',
      },
    });
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const response = await this.client.chat.completions.create({
      model: req.model,
      messages: req.messages,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      stream: false,
    });

    const choice = response.choices[0];
    if (!choice || choice.message.content === null) {
      throw new Error('OpenRouter returned empty response');
    }

    const usage = response.usage!;
    // OpenRouter adds a `cost` field not in the OpenAI SDK types
    const costUsd = (usage as unknown as { cost?: number }).cost ?? 0;

    return {
      content: choice.message.content,
      model: response.model,
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        costUsd,
      },
    };
  }

  /**
   * Tool-calling completion.
   * Returns the full ChatCompletionMessage so callers can inspect tool_calls.
   * IMPORTANT: content=null is valid for tool_calls responses — do NOT throw on null content.
   */
  async completeWithTools(req: ToolCompletionRequest): Promise<ToolCompletionResponse> {
    const response = await this.client.chat.completions.create({
      model: req.model,
      messages: req.messages,
      tools: req.tools,
      tool_choice: 'auto',
      stream: false,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('OpenRouter returned empty response for tool-calling request');
    }

    const usage = response.usage!;
    // OpenRouter adds a `cost` field not in the OpenAI SDK types
    const costUsd = (usage as unknown as { cost?: number }).cost ?? 0;

    return {
      message: choice.message,
      finishReason: choice.finish_reason ?? 'stop',
      model: response.model,
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        costUsd,
      },
    };
  }
}
