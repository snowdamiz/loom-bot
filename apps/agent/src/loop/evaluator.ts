import type { SubGoal } from '@jarvis/db';

/**
 * LOOP-03: Evaluator interface — assesses whether a sub-goal outcome aligns with the
 * overall goal intent. Wired by Supervisor in Plan 05.
 *
 * The concrete implementation lives in Plan 05. This file provides the interface
 * so AgentLoop can import it without creating a circular dependency.
 */

export interface EvaluationResult {
  /** Whether the agent is diverging from the goal */
  divergent: boolean;
  /** Severity: 'low' | 'medium' | 'high' */
  severity: string;
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
