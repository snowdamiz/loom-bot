import type { ModelRouter, ToolCompletionRequest } from '@jarvis/ai';
import type { DbClient } from '@jarvis/db';
import type { ToolRegistry } from '@jarvis/tools';
import { invokeWithKillCheck } from '@jarvis/tools';
import { logCycleStart, logCycleComplete } from '@jarvis/logging';
import type { SubGoal } from '@jarvis/db';
import type { GoalManager } from './goal-manager.js';
import type { Evaluator, EvaluationResult } from './evaluator.js';
import type { Replanner } from './replanner.js';

/**
 * Re-use the ChatCompletionMessageParam type from @jarvis/ai's ToolCompletionRequest.
 * @jarvis/agent does not have a direct dependency on openai — types come via @jarvis/ai.
 */
type ChatCompletionMessageParam = ToolCompletionRequest['messages'][number];
type ChatCompletionTool = ToolCompletionRequest['tools'][number];

/**
 * Duck-typed kill-switch interface — same pattern as invoke-safe.ts.
 * @jarvis/agent does not import @jarvis/ai's KillSwitchGuard directly here
 * so this module stays testable without full AI wiring.
 */
interface KillCheckable {
  assertActive(): Promise<void>;
}

export interface AgentLoopConfig {
  /** Maximum LLM turns per sub-goal before giving up (default: 20) */
  maxTurnsPerSubGoal?: number;
  /** Milliseconds to sleep between continuous loop iterations (default: 5000) */
  cycleSleepMs?: number;
}

/**
 * LOOP-02, LOOP-03, LOOP-04, LOOP-05: Core agentic tool-calling loop.
 *
 * AgentLoop orchestrates the full sub-goal → LLM → tool_calls → execute → repeat cycle
 * and drives the continuous autonomous loop over all active goals.
 *
 * Design invariants (from Phase 3 research):
 * 1. Each sub-goal gets a FRESH messages array — no context leakage between sub-goals.
 * 2. The assistant message (with tool_calls) MUST be appended before tool result messages
 *    (OpenRouter rejects out-of-order message arrays).
 * 3. All finish_reason values are handled exhaustively.
 * 4. 'strong' tier is used for sub-goal execution (complex multi-step reasoning with tools).
 * 5. Kill switch is checked via invokeWithKillCheck on every tool call (LOOP-02, TOOL-06).
 */
export class AgentLoop {
  private readonly maxTurnsPerSubGoal: number;
  private readonly cycleSleepMs: number;
  /** Set to true by external signal to stop the continuous loop gracefully */
  private cancelled = false;

  constructor(
    private readonly router: ModelRouter,
    private readonly registry: ToolRegistry,
    private readonly killSwitch: KillCheckable,
    private readonly db: DbClient,
    private readonly goalManager: GoalManager,
    private readonly tools: ChatCompletionTool[],
    private readonly evaluator?: Evaluator,
    private readonly replanner?: Replanner,
    config?: AgentLoopConfig,
  ) {
    this.maxTurnsPerSubGoal = config?.maxTurnsPerSubGoal ?? 20;
    this.cycleSleepMs = config?.cycleSleepMs ?? 5000;
  }

  /**
   * Signal the continuous loop to stop after the current cycle completes.
   * The loop checks this.cancelled at the top of each iteration.
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Execute a single sub-goal through the LLM tool-calling protocol.
   *
   * LOOP-02: All tool invocations go through invokeWithKillCheck.
   *
   * Message flow per turn:
   *   1. Call router.completeWithTools with current messages
   *   2. Push the assistant message (CRITICAL: before tool results)
   *   3. If finish_reason='tool_calls': execute each tool_call, push tool result messages
   *   4. If finish_reason='stop': sub-goal complete
   *   5. Repeat until stop / length / content_filter / max turns
   *
   * @param subGoal - The sub-goal to execute
   * @returns success flag and outcome (LLM's final message content or error description)
   */
  async executeSubGoal(subGoal: SubGoal): Promise<{ success: boolean; outcome: unknown }> {
    // INVARIANT: Fresh messages array per sub-goal (no context leakage)
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: [
          `You are an autonomous AI agent executing a specific sub-goal.`,
          ``,
          `SUB-GOAL: ${subGoal.description}`,
          ``,
          `CONSTRAINTS:`,
          `- Execute the sub-goal using the available tools.`,
          `- Be efficient: only call tools that are necessary.`,
          `- When the sub-goal is complete, respond with a final message summarizing what was accomplished.`,
          `- Do not ask clarifying questions — make reasonable decisions and proceed.`,
          ``,
          `AVAILABLE TOOLS:`,
          this.registry.list().map((t) => `- ${t.name}: ${t.description}`).join('\n'),
        ].join('\n'),
      },
      {
        role: 'user',
        content: `Execute this sub-goal: ${subGoal.description}`,
      },
    ];

    let turnsUsed = 0;
    let outcome: unknown = null;

    await this.goalManager.updateSubGoalStatus(subGoal.id, 'in-progress');

    while (turnsUsed < this.maxTurnsPerSubGoal) {
      // Check cancellation flag at the top of each tool-calling turn
      if (this.cancelled) {
        process.stderr.write(
          `[agent-loop] Sub-goal ${subGoal.id} cancelled mid-execution.\n`,
        );
        await this.goalManager.updateSubGoalStatus(subGoal.id, 'failed', { outcome: 'cancelled' });
        return { success: false, outcome: 'cancelled' };
      }

      turnsUsed++;

      // LOOP-02: router.completeWithTools enforces kill switch via KillSwitchGuard
      const response = await this.router.completeWithTools(
        messages,
        'strong',
        this.tools,
        { goalId: subGoal.goalId },
      );

      const { message, finishReason } = response;

      // INVARIANT: Push assistant message BEFORE any tool result messages
      // OpenRouter rejects tool result messages that appear before their corresponding
      // assistant message with tool_calls.
      messages.push(message as ChatCompletionMessageParam);

      if (finishReason === 'stop') {
        // Sub-goal complete — extract final message content as outcome
        outcome = message.content ?? 'Sub-goal completed without explicit output.';
        await this.goalManager.updateSubGoalStatus(subGoal.id, 'completed', outcome);
        return { success: true, outcome };
      }

      if (finishReason === 'tool_calls') {
        // Execute each tool call and append results
        const toolCalls = message.tool_calls ?? [];

        for (const toolCall of toolCalls) {
          let result: unknown;
          try {
            const parsedArgs: unknown = JSON.parse(toolCall.function.arguments);
            // LOOP-02, TOOL-06: Kill switch checked before each tool invocation
            const toolResult = await invokeWithKillCheck(
              this.killSwitch,
              this.registry,
              this.db,
              toolCall.function.name,
              parsedArgs,
            );
            result = toolResult;
          } catch (err) {
            // Capture tool errors as structured results so the LLM can reason about them
            result = {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }

          // Append tool result message (after the assistant message — invariant maintained)
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }

        // Continue the loop to let the LLM reason about the tool results
        continue;
      }

      if (finishReason === 'length') {
        // Context window exhausted — partial outcome
        process.stderr.write(
          `[agent-loop] Sub-goal ${subGoal.id} hit context length limit after ${turnsUsed} turns.\n`,
        );
        outcome = {
          error: 'context_length_exceeded',
          turnsUsed,
          partialContent: message.content,
        };
        await this.goalManager.updateSubGoalStatus(subGoal.id, 'failed', outcome);
        return { success: false, outcome };
      }

      if (finishReason === 'content_filter') {
        // Content filtered — cannot continue
        process.stderr.write(
          `[agent-loop] Sub-goal ${subGoal.id} hit content filter after ${turnsUsed} turns.\n`,
        );
        outcome = { error: 'content_filter_triggered', turnsUsed };
        await this.goalManager.updateSubGoalStatus(subGoal.id, 'failed', outcome);
        return { success: false, outcome };
      }

      // Unknown finish_reason — log and treat as failure
      process.stderr.write(
        `[agent-loop] Sub-goal ${subGoal.id} unknown finishReason='${finishReason}'. Stopping.\n`,
      );
      outcome = { error: `unknown_finish_reason:${finishReason}`, turnsUsed };
      await this.goalManager.updateSubGoalStatus(subGoal.id, 'failed', outcome);
      return { success: false, outcome };
    }

    // Max turns exceeded
    process.stderr.write(
      `[agent-loop] Sub-goal ${subGoal.id} exceeded max turns (${this.maxTurnsPerSubGoal}).\n`,
    );
    outcome = { error: 'max_turns_exceeded', maxTurns: this.maxTurnsPerSubGoal };
    await this.goalManager.updateSubGoalStatus(subGoal.id, 'failed', outcome);
    return { success: false, outcome: 'max turns exceeded' };
  }

  /**
   * Run a single planning cycle for a goal.
   *
   * Processes sub-goals one at a time in dependency+priority order until:
   *   - All sub-goals are complete (goal complete)
   *   - No actionable sub-goals remain (blocked/failed state)
   *   - Evaluator triggers escalation (goal paused for operator)
   *   - this.cancelled is set
   *
   * LOOP-03: If evaluator and replanner are wired, evaluates each sub-goal outcome
   * and triggers replan when divergence is detected.
   *
   * @param goalId - ID of the goal to run a cycle for
   */
  async runGoalCycle(goalId: number): Promise<void> {
    // Fetch goal description for evaluator context
    const activeGoals = await this.goalManager.getActiveGoals();
    const goal = activeGoals.find((g) => g.id === goalId);
    const goalDescription = goal?.description ?? `Goal ${goalId}`;

    // LOG-03: Log cycle start (append-only two-row pattern)
    const cycleLogId = await logCycleStart(this.db, {
      goals: { goalId, description: goalDescription },
    });

    // Evaluation results accumulated per cycle (reset here)
    const evaluations: EvaluationResult[] = [];
    const outcomes: unknown[] = [];

    try {
      while (true) {
        // Check cancellation flag
        if (this.cancelled) {
          process.stderr.write(`[agent-loop] Cycle cancelled for goal ${goalId}.\n`);
          break;
        }

        // Get next actionable sub-goal (dependency-aware, priority-ordered)
        const subGoal = await this.goalManager.getNextSubGoal(goalId);

        if (!subGoal) {
          // No actionable sub-goal — check if goal is complete or blocked
          const isComplete = await this.goalManager.isGoalComplete(goalId);
          if (isComplete) {
            process.stderr.write(`[agent-loop] Goal ${goalId} complete.\n`);
            await this.goalManager.updateGoalStatus(goalId, 'completed');
          } else {
            // Remaining sub-goals are blocked by failed/stuck dependencies
            process.stderr.write(
              `[agent-loop] Goal ${goalId} has no actionable sub-goals but is not complete. ` +
              `Some sub-goals may be blocked by failed dependencies.\n`,
            );
          }
          break;
        }

        // Execute the sub-goal
        process.stderr.write(
          `[agent-loop] Executing sub-goal ${subGoal.id}: "${subGoal.description}"\n`,
        );
        const result = await this.executeSubGoal(subGoal);
        outcomes.push(result.outcome);

        // LOOP-03: Evaluate outcome if evaluator is wired
        if (this.evaluator) {
          const evaluation = await this.evaluator.evaluateOutcome(
            subGoal,
            result.outcome,
            goalDescription,
          );
          evaluations.push(evaluation);

          if (this.evaluator.shouldReplan(goalId, evaluations) && this.replanner) {
            process.stderr.write(
              `[agent-loop] Divergence detected for goal ${goalId}. Triggering replan.\n`,
            );
            const replanResult = await this.replanner.replan(
              goalId,
              evaluation.reason ?? 'divergence detected',
            );

            if (replanResult.escalated) {
              // Operator intervention required — pause goal and stop cycle
              process.stderr.write(
                `[agent-loop] Goal ${goalId} escalated to operator. Pausing.\n`,
              );
              await this.goalManager.updateGoalStatus(
                goalId,
                'paused',
                replanResult.reason ?? 'Escalated due to divergence',
              );
              break;
            }

            if (replanResult.replanned) {
              // New sub-goals inserted — continue loop (getNextSubGoal picks them up)
              process.stderr.write(
                `[agent-loop] Goal ${goalId} replanned. Continuing cycle with new sub-goals.\n`,
              );
              // Reset evaluations after a successful replan
              evaluations.length = 0;
            }
          }
        }
      }
    } finally {
      // LOG-03: Always log cycle completion (append-only)
      await logCycleComplete(this.db, {
        parentId: cycleLogId,
        outcomes: { goalId, outcomes },
      });
    }
  }

  /**
   * Run the continuous autonomous loop over all active goals.
   *
   * LOOP-04: Infinite loop without human intervention.
   * - Gets active goals ordered by priority
   * - Runs a planning cycle for each
   * - Sleeps for cycleSleepMs between iterations
   * - Checks kill switch state before each iteration (via goalManager which uses router,
   *   which checks the kill switch)
   *
   * This method does NOT return unless an unhandled error is thrown.
   */
  async runContinuousLoop(): Promise<void> {
    process.stderr.write('[agent-loop] Starting continuous autonomous loop.\n');

    while (true) {
      // Respect cancellation signal
      if (this.cancelled) {
        process.stderr.write('[agent-loop] Continuous loop cancelled. Shutting down.\n');
        break;
      }

      let activeGoals;
      try {
        activeGoals = await this.goalManager.getActiveGoals();
      } catch (err) {
        // DB or kill switch error — log and sleep before retry
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[agent-loop] Error fetching active goals: ${message}. Sleeping.\n`);
        await sleep(this.cycleSleepMs);
        continue;
      }

      if (activeGoals.length === 0) {
        // No active goals — idle sleep
        process.stderr.write('[agent-loop] No active goals. Sleeping.\n');
      } else {
        // Process all active goals in priority order
        for (const goal of activeGoals) {
          if (this.cancelled) break;
          try {
            await this.runGoalCycle(goal.id);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            process.stderr.write(
              `[agent-loop] Error in cycle for goal ${goal.id}: ${message}\n`,
            );
          }
        }
      }

      // Sleep between iterations
      await sleep(this.cycleSleepMs);
    }
  }
}

/**
 * Simple promise-based sleep utility.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
