import { goals, subGoals, eq, and, asc } from '@jarvis/db';
import type { DbClient } from '@jarvis/db';
import type { Goal, NewGoal } from '@jarvis/db';
import type { SubGoal } from '@jarvis/db';
import type { ModelRouter } from '@jarvis/ai';
import { planGoalDecomposition } from './planner.js';

/**
 * LOOP-01, LOOP-03, LOOP-05: Goal lifecycle management.
 *
 * GoalManager is the single source of truth for goal and sub-goal state in the database.
 * It provides:
 *   - Goal creation (operator-injected and agent-discovered)
 *   - LLM-driven goal decomposition into sub-goals with dependency tracking
 *   - Sub-goal status management (pending → in-progress → completed | failed | skipped)
 *   - Dependency-aware next-sub-goal selection (LOOP-05: priority ordering)
 *   - Goal completion detection
 */
export class GoalManager {
  constructor(
    private readonly db: DbClient,
    private readonly router: ModelRouter,
  ) {}

  /**
   * Create a new top-level goal and persist it to the goals table.
   *
   * @param description - Human-readable description of what the goal should accomplish
   * @param source      - 'operator-injected' for CLI-created goals, 'agent-discovered' for autonomous ones
   * @param priority    - 0 = highest priority (default 50)
   * @returns The inserted Goal row
   */
  async createGoal(
    description: string,
    source: 'operator-injected' | 'agent-discovered',
    priority = 50,
  ): Promise<Goal> {
    const values: NewGoal = { description, source, priority };
    const rows = await this.db.insert(goals).values(values).returning();
    const row = rows[0];
    if (!row) {
      throw new Error('GoalManager.createGoal: insert returned no rows');
    }
    return row;
  }

  /**
   * Decompose a goal into sub-goals using the LLM planner.
   *
   * Calls planGoalDecomposition to get an ordered list of sub-goal descriptors,
   * then inserts them into the sub_goals table. dependsOn in the planner response
   * uses 0-based array indices; this method resolves them to actual DB IDs after insert.
   *
   * @param goalId - ID of the parent goal to decompose
   * @returns The inserted SubGoal rows
   */
  async decomposeGoal(goalId: number): Promise<SubGoal[]> {
    // Look up the goal description
    const goalRows = await this.db
      .select()
      .from(goals)
      .where(eq(goals.id, goalId))
      .limit(1);
    const goal = goalRows[0];
    if (!goal) {
      throw new Error(`GoalManager.decomposeGoal: goal ${goalId} not found`);
    }

    // Get available tools for the planner prompt (from a no-tools list for now;
    // the concrete tool list is injected at AgentLoop construction time)
    const availableTools: Array<{ name: string; description: string }> = [];

    // Ask the LLM to decompose the goal
    const descriptors = await planGoalDecomposition(this.router, goal.description, availableTools);

    if (descriptors.length === 0) {
      throw new Error(`GoalManager.decomposeGoal: planner returned 0 sub-goals for goal ${goalId}`);
    }

    // Insert sub-goals without dependsOn first (we need IDs to resolve index references)
    const insertedRows: SubGoal[] = [];
    for (const descriptor of descriptors) {
      const rows = await this.db
        .insert(subGoals)
        .values({
          goalId,
          description: descriptor.description,
          dependsOn: [], // populated in second pass below
          priority: descriptor.priority,
        })
        .returning();
      const row = rows[0];
      if (!row) {
        throw new Error('GoalManager.decomposeGoal: sub-goal insert returned no rows');
      }
      insertedRows.push(row);
    }

    // Second pass: resolve 0-based index references to actual DB IDs and update
    for (let i = 0; i < descriptors.length; i++) {
      const descriptor = descriptors[i]!;
      const inserted = insertedRows[i]!;

      if (descriptor.dependsOn.length > 0) {
        const resolvedIds = descriptor.dependsOn.map((idx) => {
          const dep = insertedRows[idx];
          if (!dep) {
            throw new Error(
              `GoalManager.decomposeGoal: sub-goal[${i}].dependsOn[${idx}] out of range (${insertedRows.length} sub-goals)`,
            );
          }
          return dep.id;
        });

        const updatedRows = await this.db
          .update(subGoals)
          .set({ dependsOn: resolvedIds })
          .where(eq(subGoals.id, inserted.id))
          .returning();
        if (updatedRows[0]) {
          insertedRows[i] = updatedRows[0];
        }
      }
    }

    return insertedRows;
  }

  /**
   * Get all active goals ordered by priority (0 = highest).
   *
   * LOOP-05: Active goals are processed in priority order during the continuous loop.
   */
  async getActiveGoals(): Promise<Goal[]> {
    return this.db
      .select()
      .from(goals)
      .where(eq(goals.status, 'active'))
      .orderBy(asc(goals.priority));
  }

  /**
   * Get all sub-goals for a given goal, ordered by priority.
   */
  async getSubGoals(goalId: number): Promise<SubGoal[]> {
    return this.db
      .select()
      .from(subGoals)
      .where(eq(subGoals.goalId, goalId))
      .orderBy(asc(subGoals.priority));
  }

  /**
   * Get the next actionable sub-goal for a goal.
   *
   * A sub-goal is actionable when:
   *   1. Its status is 'pending'
   *   2. All sub-goals referenced in its dependsOn array are 'completed' or 'skipped'
   *
   * Returns the lowest-priority sub-goal (0 = highest) that meets both criteria,
   * or null if no sub-goals are currently actionable.
   *
   * LOOP-05: Priority ordering ensures deterministic sub-goal selection.
   */
  async getNextSubGoal(goalId: number): Promise<SubGoal | null> {
    // Fetch all sub-goals for this goal
    const allSubGoals = await this.getSubGoals(goalId);

    // Build a map from sub-goal ID → status for fast dependency lookups
    const statusById = new Map<number, string>(allSubGoals.map((sg) => [sg.id, sg.status]));

    // Find the first pending sub-goal whose dependencies are all satisfied
    for (const sg of allSubGoals) {
      if (sg.status !== 'pending') continue;

      const deps = Array.isArray(sg.dependsOn) ? (sg.dependsOn as number[]) : [];
      const allDepsComplete = deps.every((depId) => {
        const depStatus = statusById.get(depId);
        return depStatus === 'completed' || depStatus === 'skipped';
      });

      if (allDepsComplete) {
        return sg;
      }
    }

    return null;
  }

  /**
   * Update a sub-goal's status and optional outcome.
   *
   * Sets completedAt when status is 'completed' or 'failed'.
   */
  async updateSubGoalStatus(
    subGoalId: number,
    status: string,
    outcome?: unknown,
  ): Promise<void> {
    const isTerminal = status === 'completed' || status === 'failed';

    await this.db
      .update(subGoals)
      .set({
        status,
        outcome: outcome !== undefined ? (outcome as Record<string, unknown>) : undefined,
        completedAt: isTerminal ? new Date() : undefined,
      })
      .where(eq(subGoals.id, subGoalId));
  }

  /**
   * Update a goal's status and optional pause reason.
   */
  async updateGoalStatus(
    goalId: number,
    status: string,
    pauseReason?: string,
  ): Promise<void> {
    await this.db
      .update(goals)
      .set({
        status,
        pauseReason: pauseReason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(goals.id, goalId));
  }

  /**
   * Increment the replanCount for a goal and return the new value.
   *
   * Called by the replanner when re-decomposing a goal due to divergence.
   */
  async incrementReplanCount(goalId: number): Promise<number> {
    const currentRows = await this.db
      .select({ replanCount: goals.replanCount })
      .from(goals)
      .where(eq(goals.id, goalId))
      .limit(1);

    const current = currentRows[0]?.replanCount ?? 0;
    const newCount = current + 1;

    await this.db
      .update(goals)
      .set({ replanCount: newCount, updatedAt: new Date() })
      .where(eq(goals.id, goalId));

    return newCount;
  }

  /**
   * Check whether all sub-goals for a goal are in a terminal state.
   *
   * A goal is considered complete when every sub-goal is 'completed' or 'skipped'.
   * Returns true for goals with 0 sub-goals (edge case: an empty goal is vacuously complete).
   */
  async isGoalComplete(goalId: number): Promise<boolean> {
    const allSubGoals = await this.getSubGoals(goalId);

    if (allSubGoals.length === 0) return true;

    return allSubGoals.every(
      (sg) => sg.status === 'completed' || sg.status === 'skipped',
    );
  }
}
