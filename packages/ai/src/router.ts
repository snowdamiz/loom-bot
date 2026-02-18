import { aiCalls } from '@jarvis/db';
import type { DbClient } from '@jarvis/db';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import type { ModelTierConfig, Tier } from './config.js';
import type { KillSwitchGuard } from './kill-switch.js';
import type { AiProvider, CompletionRequest, CompletionResponse, ToolCompletionResponse } from './provider.js';

/**
 * MODL-01, MODL-02, MODL-03, MODL-04: Model router.
 * Resolves tier names to concrete model IDs, enforces kill switch,
 * and logs every completion to the ai_calls table.
 */
export class ModelRouter {
  constructor(
    private readonly provider: AiProvider,
    private readonly config: ModelTierConfig,
    private readonly db: DbClient,
    private readonly killSwitch: KillSwitchGuard,
  ) {}

  /**
   * Route a completion request through the tier-based model selection.
   *
   * Steps:
   * 1. Assert kill switch is not active (KILL-02)
   * 2. Resolve tier to concrete model ID (MODL-01)
   * 3. Dispatch to provider (MODL-05)
   * 4. Log completion to ai_calls table (MODL-02, COST-01)
   * 5. Return response
   */
  async complete(
    messages: CompletionRequest['messages'],
    tier: Tier,
    context?: { goalId?: number },
  ): Promise<CompletionResponse> {
    // KILL-02: Enforce kill switch before every AI call
    await this.killSwitch.assertActive();

    // MODL-01: Resolve tier name to concrete OpenRouter model ID
    const modelId = this.config[tier];

    // MODL-05: Delegate to provider
    const req: CompletionRequest = { messages, model: modelId };
    const response = await this.provider.complete(req);

    // MODL-02, COST-01: Log every completion to ai_calls
    // Drizzle numeric columns accept string values for exact decimal precision
    await this.db.insert(aiCalls).values({
      model: response.model,
      tier,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      costUsd: response.usage.costUsd.toString(),
      goalId: context?.goalId ?? null,
    });

    return response;
  }

  /**
   * Route a tool-calling completion request through the tier-based model selection.
   *
   * Steps:
   * 1. Assert kill switch is not active (KILL-02)
   * 2. Resolve tier to concrete model ID (MODL-01)
   * 3. Dispatch to provider.completeWithTools (MODL-05)
   * 4. Log completion to ai_calls table (MODL-02, COST-01)
   * 5. Return full ToolCompletionResponse (including tool_calls if present)
   */
  async completeWithTools(
    messages: ChatCompletionMessageParam[],
    tier: Tier,
    tools: ChatCompletionTool[],
    context?: { goalId?: number },
  ): Promise<ToolCompletionResponse> {
    // KILL-02: Enforce kill switch before every AI call
    await this.killSwitch.assertActive();

    // MODL-01: Resolve tier name to concrete OpenRouter model ID
    const modelId = this.config[tier];

    // MODL-05: Delegate to provider
    const response = await this.provider.completeWithTools({
      messages,
      model: modelId,
      tools,
    });

    // MODL-02, COST-01: Log every completion to ai_calls
    await this.db.insert(aiCalls).values({
      model: response.model,
      tier,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      costUsd: response.usage.costUsd.toString(),
      goalId: context?.goalId ?? null,
    });

    return response;
  }
}
