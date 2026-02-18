/**
 * LOOP-03: Replanner interface — re-decomposes a goal when the evaluator detects
 * significant divergence. Wired by Supervisor in Plan 05.
 *
 * The concrete implementation lives in Plan 05. This file provides the interface
 * so AgentLoop can import it without creating a circular dependency.
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
