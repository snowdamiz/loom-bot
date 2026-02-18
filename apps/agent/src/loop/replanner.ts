import { sendOperatorDm } from '@jarvis/ai';
import type { ModelRouter } from '@jarvis/ai';
import type { DbClient } from '@jarvis/db';
import type { GoalManager } from './goal-manager.js';

/**
 * LOOP-03: Replanner — re-decomposes a goal when the evaluator detects significant
 * divergence. Evaluates in-progress work for continued relevance, re-decomposes the
 * goal with updated context, and escalates to the operator when the replan limit is reached.
 *
 * Locked decisions:
 * - Operator notified ONLY on major replans (top-level goal changes). Routine sub-goal
 *   replanning is logged but silent.
 * - Hard replan limit per goal → escalate to operator. Goal is PAUSED (not abandoned).
 * - When replanning triggers, agent evaluates whether in-progress work is still useful.
 */

export interface ReplanResult {
  /** True if the goal was successfully re-decomposed into new sub-goals */
  replanned?: boolean;
  /** True if the divergence was severe enough to escalate to the operator */
  escalated?: boolean;
  /** Human-readable explanation of what was replanned or why escalation occurred */
  reason?: string;
}

export interface Replanner {
  /**
   * Re-decompose a goal after divergence is detected.
   *
   * When replanned=true: AgentLoop continues with the new sub-goals.
   * When escalated=true: AgentLoop breaks the cycle and pauses the goal.
   *
   * @param goalId - The goal to replan
   * @param reason - Why replan was triggered (from EvaluationResult.reason)
   */
  replan(goalId: number, reason: string): Promise<ReplanResult>;
}

const DEFAULT_MAX_REPLANS_PER_GOAL = 5;

/**
 * Concrete implementation of the Replanner interface.
 *
 * Replan protocol:
 * 1. Increment replan count
 * 2. Check hard limit → escalate if exceeded (Discord DM + goal paused)
 * 3. Evaluate in-progress sub-goals — keep useful ones, abort irrelevant ones
 * 4. Mark pending sub-goals as 'skipped' (old plan)
 * 5. Re-decompose goal with updated context (what was already accomplished)
 * 6. Notify operator via Discord DM (non-fatal)
 */
export class ReplannerImpl implements Replanner {
  private readonly maxReplansPerGoal: number;

  constructor(
    private readonly goalManager: GoalManager,
    private readonly router: ModelRouter,
    private readonly db: DbClient,
    config?: { maxReplansPerGoal?: number },
  ) {
    this.maxReplansPerGoal = config?.maxReplansPerGoal ?? DEFAULT_MAX_REPLANS_PER_GOAL;
  }

  async replan(goalId: number, reason: string): Promise<ReplanResult> {
    // Step 1: Increment replan count
    const replanCount = await this.goalManager.incrementReplanCount(goalId);

    process.stderr.write(
      `[replanner] Goal ${goalId} replan attempt ${replanCount}/${this.maxReplansPerGoal}: ${reason}\n`,
    );

    // Step 2: Check hard limit
    if (replanCount > this.maxReplansPerGoal) {
      const escalationReason = `Goal ${goalId} exceeded replan limit (${this.maxReplansPerGoal}). Last reason: ${reason}`;

      // Pause the goal — not abandoned, pending operator decision
      await this.goalManager.updateGoalStatus(goalId, 'paused', escalationReason);

      // Send Discord DM alert (non-fatal)
      await this.sendOperatorAlert(
        goalId,
        replanCount,
        `Replan limit exceeded (${this.maxReplansPerGoal} replans). Goal paused pending operator review. Last reason: ${reason}`,
      );

      process.stderr.write(
        `[replanner] Goal ${goalId} escalated to operator after ${replanCount} replans.\n`,
      );

      return { replanned: false, escalated: true, reason: escalationReason };
    }

    // Step 3: Evaluate in-progress sub-goals — keep useful ones, abort irrelevant ones
    const allSubGoals = await this.goalManager.getSubGoals(goalId);

    const inProgressSubGoals = allSubGoals.filter((sg) => sg.status === 'in-progress');
    const pendingSubGoals = allSubGoals.filter((sg) => sg.status === 'pending');

    // Evaluate each in-progress sub-goal against the replan reason
    for (const subGoal of inProgressSubGoals) {
      try {
        const response = await this.router.complete(
          [
            {
              role: 'system',
              content:
                'You are a planning assistant. Assess whether in-progress work is still relevant given a change in plan direction. Respond with valid JSON only.',
            },
            {
              role: 'user',
              content: [
                `Replan reason: ${reason}`,
                `In-progress sub-goal: "${subGoal.description}"`,
                '',
                'Is this sub-goal still useful to complete given the replan? Or should it be abandoned?',
                '',
                'Respond with JSON only:',
                '{ "keep": boolean, "reason": string }',
              ].join('\n'),
            },
          ],
          'cheap',
          { goalId },
        );

        const rawContent = response.content.trim();
        const jsonStr = rawContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        const parsed = JSON.parse(jsonStr) as { keep?: boolean; reason?: string };

        if (parsed.keep === false) {
          process.stderr.write(
            `[replanner] Skipping in-progress sub-goal ${subGoal.id}: ${parsed.reason ?? 'no longer relevant'}\n`,
          );
          await this.goalManager.updateSubGoalStatus(subGoal.id, 'skipped');
        } else {
          process.stderr.write(
            `[replanner] Keeping in-progress sub-goal ${subGoal.id}: ${parsed.reason ?? 'still relevant'}\n`,
          );
        }
      } catch (err) {
        // If LLM evaluation fails, keep the in-progress work (conservative)
        process.stderr.write(
          `[replanner] Failed to evaluate in-progress sub-goal ${subGoal.id}: ${err instanceof Error ? err.message : String(err)}. Keeping.\n`,
        );
      }
    }

    // Step 4: Mark all pending sub-goals as 'skipped' (they were part of the old plan)
    for (const subGoal of pendingSubGoals) {
      await this.goalManager.updateSubGoalStatus(subGoal.id, 'skipped');
    }

    process.stderr.write(
      `[replanner] Cleared ${pendingSubGoals.length} pending sub-goals. Re-decomposing goal ${goalId}.\n`,
    );

    // Step 5: Re-decompose the goal with fresh sub-goals
    // decomposeGoal uses the goal description + planner to generate new sub-goals
    try {
      const newSubGoals = await this.goalManager.decomposeGoal(goalId);
      process.stderr.write(
        `[replanner] Goal ${goalId} re-decomposed into ${newSubGoals.length} new sub-goals.\n`,
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[replanner] Re-decomposition failed for goal ${goalId}: ${errMsg}\n`);
      return { replanned: false, escalated: false, reason: `Re-decomposition failed: ${errMsg}` };
    }

    // Step 6: Notify operator via Discord DM (non-fatal, only on major replans)
    await this.sendOperatorAlert(
      goalId,
      replanCount,
      reason,
    );

    return { replanned: true, escalated: false };
  }

  /**
   * Send a Discord DM alert to the operator. Non-fatal — failures are logged but do not
   * interrupt the replan flow.
   */
  private async sendOperatorAlert(
    goalId: number,
    replanCount: number,
    reason: string,
  ): Promise<void> {
    const token = process.env['DISCORD_TOKEN'];
    const operatorUserId = process.env['DISCORD_OPERATOR_USER_ID'];

    if (!token || !operatorUserId) {
      process.stderr.write(
        `[replanner] Discord DM not sent — DISCORD_TOKEN or DISCORD_OPERATOR_USER_ID not set.\n`,
      );
      return;
    }

    try {
      await sendOperatorDm(
        token,
        operatorUserId,
        `[Jarvis] Goal #${goalId} replanned (attempt ${replanCount}): ${reason}`,
      );
    } catch (err) {
      // Non-fatal: Discord DM failure does not block the replan
      process.stderr.write(
        `[replanner] Discord DM failed for goal ${goalId}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}
