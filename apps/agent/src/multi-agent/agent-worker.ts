import { Worker } from 'bullmq';
import type { ModelRouter, ToolCompletionRequest } from '@jarvis/ai';
import { toolDefinitionsToOpenAI } from '@jarvis/ai';
import type { ToolRegistry } from '@jarvis/tools';
import { invokeWithKillCheck } from '@jarvis/tools';
import type { DbClient } from '@jarvis/db';

/**
 * Re-use the ChatCompletionMessageParam type from @jarvis/ai's ToolCompletionRequest.
 * @jarvis/agent does not have a direct openai dependency —
 * types are accessed via @jarvis/ai (same pattern as agent-loop.ts).
 */
type ChatCompletionMessageParam = ToolCompletionRequest['messages'][number];

/**
 * Duck-typed kill switch interface (same pattern as invoke-safe.ts).
 * Keeps agent-worker independent from @jarvis/ai internals while
 * still enforcing the kill switch on every AI call.
 */
interface KillCheckable {
  assertActive(): Promise<void>;
}

/**
 * MULTI-02: Build the system prompt for a sub-agent with isolated, scoped context.
 *
 * Sub-agents receive ONLY the task description and explicitly scoped context —
 * not the parent agent's full message history or sibling agent state.
 */
function buildSubAgentSystemPrompt(task: string, context: Record<string, unknown>): string {
  return [
    `You are a focused sub-agent. Your task: ${task}`,
    `Context: ${JSON.stringify(context)}`,
    'Execute the task using the available tools. When done, provide a clear summary of what you accomplished and the structured result.',
    'Do NOT attempt tasks outside your scope. If you cannot complete the task, explain why.',
  ].join('\n\n');
}

/**
 * MULTI-01, MULTI-02, MULTI-03: BullMQ worker that processes sub-agent jobs.
 *
 * Each job runs a self-contained agentic tool-calling loop with:
 * - Isolated LLM context (fresh message array per job, not shared with parent)
 * - Shared ModelRouter instance (shared cost pool via ai_calls logging)
 * - Shared ToolRegistry (same tool set as parent agent)
 * - Max 15 turns (sub-agents are focused, not open-ended)
 *
 * Job data format: { task: string, context: Record<string, unknown> }
 * Return value (job.returnvalue): { success: true, result: string } | { success: false, error: string }
 *
 * The return value is accessible via await-agent's poll → job.returnvalue.
 * (MULTI-03: structured results returned as job.returnvalue)
 */
export function createAgentWorker(deps: {
  redisUrl: string;
  router: ModelRouter;
  registry: ToolRegistry;
  killSwitch: KillCheckable;
  db: DbClient;
  concurrency?: number;
}): Worker {
  const { redisUrl, router, registry, killSwitch, db, concurrency = 3 } = deps;

  return new Worker(
    'agent-tasks',
    async (job) => {
      // MULTI-02: Derive fresh tool snapshot from registry at job start.
      // Captures all tools registered at startup (Phase 1-8) plus any
      // tools added by tool_write at runtime since last job.
      const tools = toolDefinitionsToOpenAI(registry);

      const { task, context } = job.data as {
        task: string;
        context: Record<string, unknown>;
      };

      // MULTI-02: Create a FRESH messages array — isolated LLM context per job.
      // No shared message history with parent or other sub-agents.
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: buildSubAgentSystemPrompt(task, context) },
        { role: 'user', content: task },
      ];

      const MAX_TURNS = 15;

      for (let turn = 0; turn < MAX_TURNS; turn++) {
        // Use 'mid' tier for sub-agents — focused tasks don't need 'strong' reasoning
        const response = await router.completeWithTools(messages, 'mid', tools);

        const { message, finishReason } = response;

        // Push assistant message BEFORE tool results (critical protocol order)
        messages.push(message as ChatCompletionMessageParam);

        if (finishReason === 'stop') {
          // Sub-agent completed — return structured result
          return { success: true, result: message.content ?? '' };
        }

        if (finishReason === 'length' || finishReason === 'content_filter') {
          return { success: false, error: finishReason };
        }

        if (finishReason === 'tool_calls' && message.tool_calls && message.tool_calls.length > 0) {
          // Execute each tool call via invokeWithKillCheck
          const toolResultMessages: ChatCompletionMessageParam[] = [];

          for (const toolCall of message.tool_calls) {
            const toolName = toolCall.function.name;
            let rawInput: unknown;

            try {
              rawInput = JSON.parse(toolCall.function.arguments);
            } catch {
              rawInput = {};
            }

            const result = await invokeWithKillCheck(killSwitch, registry, db, toolName, rawInput);

            // Format result as tool message for the next turn
            const toolContent = result.success
              ? JSON.stringify(result.output)
              : `Error: ${result.error ?? 'tool invocation failed'}`;

            toolResultMessages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: toolContent,
            });
          }

          // Add all tool results to the message history
          messages.push(...toolResultMessages);
          continue;
        }

        // Unknown finish reason — treat as done
        return { success: false, error: `unexpected finishReason: ${finishReason}` };
      }

      // Exceeded max turns
      return { success: false, error: 'max turns exceeded' };
    },
    {
      connection: { url: redisUrl },
      // Per-main-agent sub-agent cap (locked decision: concurrency 3)
      concurrency,
      removeOnComplete: { age: 3600 },
      // Omit removeOnFail — failed jobs are preserved indefinitely for DLQ inspection (QUEUE-02)
    },
  );
}
