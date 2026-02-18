import { aiCalls, eq, and, gt } from '@jarvis/db';
import type { DbClient, SubGoal } from '@jarvis/db';
import type { ModelRouter } from '@jarvis/ai';

/**
 * LOOP-03: Evaluator — assesses whether sub-goal outcomes align with the overall
 * goal intent. Provides dual divergence detection: fast metric-based triggers
 * and LLM evaluation for subtler misalignment.
 *
 * Design invariants:
 * 1. Metric triggers fire FIRST — no LLM call if a metric already flags divergence (saves cost).
 * 2. LLM evaluation uses 'cheap' tier — this is a classification task, not complex reasoning.
 * 3. shouldReplan() uses accumulation logic — minor issues compound over time.
 */

export interface EvaluationResult {
  /** Whether the agent is diverging from the goal */
  divergent: boolean;
  /** Severity of divergence */
  severity: 'none' | 'minor' | 'major';
  /** Human-readable reason for divergence (present when divergent=true) */
  reason?: string;
}

export interface Evaluator {
  /**
   * Evaluate whether a sub-goal outcome aligns with the parent goal.
   *
   * @param subGoal        - The sub-goal that was just executed
   * @param outcome        - The result produced by executeSubGoal
   * @param goalDescription - Description of the parent goal for alignment checking
   */
  evaluateOutcome(
    subGoal: SubGoal,
    outcome: unknown,
    goalDescription: string,
  ): Promise<EvaluationResult>;

  /**
   * Decide whether the accumulated evaluations warrant a replan.
   *
   * @param goalId      - Goal being evaluated
   * @param evaluations - All evaluation results so far this cycle
   */
  shouldReplan(
    goalId: number,
    evaluations: EvaluationResult[],
  ): boolean;
}

/** Cost threshold (USD) per goal before triggering metric-based divergence */
const DEFAULT_COST_THRESHOLD_USD = 5.0;

/**
 * Concrete implementation of the Evaluator interface.
 *
 * Uses dual detection:
 * 1. Metric-based triggers (fast, no LLM): failure outcomes, high retry counts, cost overruns
 * 2. LLM evaluation (cheap tier): subtler alignment checks when metrics pass
 */
export class EvaluatorImpl implements Evaluator {
  private readonly costThresholdUsd: number;

  constructor(
    private readonly router: ModelRouter,
    private readonly db: DbClient,
    config?: { costThresholdUsd?: number },
  ) {
    this.costThresholdUsd = config?.costThresholdUsd ?? DEFAULT_COST_THRESHOLD_USD;
  }

  /**
   * Evaluate a sub-goal outcome for divergence from the overall goal.
   *
   * Step 1 — Metric triggers (no LLM):
   *   - outcome.success === false → major divergence
   *   - Total AI spend for goalId exceeds cost threshold → major divergence
   *
   * Step 2 — LLM evaluation (only if metrics pass):
   *   - Cheap-tier LLM assesses alignment and returns structured JSON
   */
  async evaluateOutcome(
    subGoal: SubGoal,
    outcome: unknown,
    goalDescription: string,
  ): Promise<EvaluationResult> {
    // --- Step 1: Metric-based triggers (fast path) ---

    // Check if outcome explicitly indicates failure
    if (
      outcome !== null &&
      typeof outcome === 'object' &&
      'success' in outcome &&
      (outcome as { success: unknown }).success === false
    ) {
      const outcomeObj = outcome as Record<string, unknown>;
      const errorInfo =
        'error' in outcomeObj
          ? String(outcomeObj['error'])
          : 'sub-goal reported failure';
      return {
        divergent: true,
        severity: 'major',
        reason: `Sub-goal failed: ${errorInfo}`,
      };
    }

    // Check cumulative AI cost for this goal
    if (subGoal.goalId !== null) {
      try {
        const costRows = await this.db
          .select({ costUsd: aiCalls.costUsd })
          .from(aiCalls)
          .where(
            and(
              eq(aiCalls.goalId, subGoal.goalId),
              gt(aiCalls.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
            ),
          );

        const totalCost = costRows.reduce(
          (sum, row) => sum + parseFloat(row.costUsd ?? '0'),
          0,
        );

        if (totalCost > this.costThresholdUsd) {
          return {
            divergent: true,
            severity: 'major',
            reason: `AI cost for goal ${subGoal.goalId} exceeded threshold: $${totalCost.toFixed(4)} > $${this.costThresholdUsd}`,
          };
        }
      } catch (err) {
        // Non-fatal — cost check failure doesn't block execution
        process.stderr.write(
          `[evaluator] Cost check failed for goal ${subGoal.goalId}: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }

    // --- Step 2: LLM evaluation (subtler alignment check) ---
    try {
      const response = await this.router.complete(
        [
          {
            role: 'system',
            content:
              'You are an evaluation assistant. Assess whether a sub-goal outcome aligns with the parent goal. Respond with valid JSON only.',
          },
          {
            role: 'user',
            content: [
              `Goal: ${goalDescription}`,
              `Sub-goal: ${subGoal.description}`,
              `Outcome: ${JSON.stringify(outcome)}`,
              '',
              'Evaluate: Did this outcome move us toward the goal? Is the quality acceptable? Are there unexpected results that suggest the plan needs adjustment?',
              '',
              'Respond with JSON only (no markdown, no explanation outside JSON):',
              '{ "divergent": boolean, "reason": string, "severity": "none" | "minor" | "major" }',
            ].join('\n'),
          },
        ],
        'cheap',
        { goalId: subGoal.goalId ?? undefined },
      );

      const rawContent = response.content.trim();
      // Strip markdown code fences if present
      const jsonStr = rawContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(jsonStr) as {
        divergent?: boolean;
        reason?: string;
        severity?: string;
      };

      const divergent = Boolean(parsed.divergent);
      const severity =
        parsed.severity === 'major'
          ? 'major'
          : parsed.severity === 'minor'
          ? 'minor'
          : 'none';

      return {
        divergent,
        severity: divergent ? (severity === 'none' ? 'minor' : severity) : 'none',
        reason: parsed.reason,
      };
    } catch (err) {
      // LLM evaluation failure is non-fatal — treat as non-divergent
      process.stderr.write(
        `[evaluator] LLM evaluation failed for sub-goal ${subGoal.id}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return { divergent: false, severity: 'none' };
    }
  }

  /**
   * Decide whether accumulated evaluations warrant a replan.
   *
   * Returns true if:
   * - Any evaluation has severity === 'major'
   * - More than 2 evaluations have severity === 'minor' (accumulating minor issues)
   * - More than 50% of recent evaluations are divergent
   */
  shouldReplan(goalId: number, evaluations: EvaluationResult[]): boolean {
    if (evaluations.length === 0) return false;

    // Any major divergence → replan immediately
    if (evaluations.some((e) => e.severity === 'major')) return true;

    // Accumulating minor issues (more than 2)
    const minorCount = evaluations.filter((e) => e.severity === 'minor').length;
    if (minorCount > 2) return true;

    // More than 50% of recent evaluations are divergent
    const divergentCount = evaluations.filter((e) => e.divergent).length;
    if (evaluations.length >= 4 && divergentCount / evaluations.length > 0.5) return true;

    return false;
  }
}
