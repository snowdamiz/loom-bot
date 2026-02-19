import { strategies, eq, asc, sql } from '@jarvis/db';
import type { DbClient, Strategy, NewStrategy, Goal } from '@jarvis/db';
import type { GoalManager } from '../loop/goal-manager.js';

/**
 * STRAT-03, STRAT-06: Domain-agnostic strategy lifecycle manager.
 *
 * StrategyManager is the single source of truth for strategy state. It provides:
 *   - Strategy creation paired with a goal (createStrategy creates both)
 *   - Lifecycle state transitions (transitionStatus)
 *   - Metadata updates for domain-specific context (updateMetadata)
 *   - Queries for active strategies and goal-strategy lookup
 *
 * The strategy engine is intentionally domain-agnostic. No financial logic, no
 * domain-specific interfaces. All lifecycle decisions are left to the LLM — this
 * class only provides the CRUD and state transition primitives.
 */
export class StrategyManager {
  constructor(
    private readonly db: DbClient,
    private readonly goalManager: GoalManager,
  ) {}

  /**
   * Create a new strategy paired with a goal.
   *
   * Creates a goal row first (via GoalManager), then inserts a strategy row
   * referencing that goal. The initial status is 'hypothesis' — the LLM decides
   * when to transition to 'testing' or beyond.
   *
   * @param hypothesis - LLM-generated description of what this strategy is and why it will work
   * @param metadata   - Optional domain-specific context (capital, platform, metrics, etc.)
   * @returns The inserted strategy and its paired goal
   */
  async createStrategy(
    hypothesis: string,
    metadata?: Record<string, unknown>,
  ): Promise<{ strategy: Strategy; goal: Goal }> {
    const goal = await this.goalManager.createGoal(
      `Strategy: ${hypothesis}`,
      'agent-discovered',
      50,
    );

    const values: NewStrategy = {
      goalId: goal.id,
      hypothesis,
      status: 'hypothesis',
      metadata: metadata ?? null,
    };

    const rows = await this.db.insert(strategies).values(values).returning();
    const strategy = rows[0];
    if (!strategy) {
      throw new Error('StrategyManager.createStrategy: insert returned no rows');
    }

    return { strategy, goal };
  }

  /**
   * Transition a strategy to a new lifecycle state.
   *
   * Updates status, lastTransitionReason, and updatedAt directly on the
   * strategies row. Strategies table is a living registry (not append-only) —
   * direct updates are correct per the strategy engine design.
   *
   * Valid states: 'hypothesis', 'testing', 'active', 'paused', 'killed', 'completed'
   *
   * @param strategyId - ID of the strategy to transition
   * @param newStatus  - Target lifecycle state
   * @param reason     - LLM-supplied reasoning for the transition
   */
  async transitionStatus(
    strategyId: number,
    newStatus: string,
    reason: string,
  ): Promise<void> {
    await this.db
      .update(strategies)
      .set({
        status: newStatus,
        lastTransitionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(strategies.id, strategyId));
  }

  /**
   * Merge new metadata keys into the strategy's existing metadata jsonb.
   *
   * The agent uses this to store domain-specific data (capital allocated,
   * platform credentials, metrics snapshots, etc.) without requiring schema changes.
   *
   * @param strategyId - ID of the strategy to update
   * @param metadata   - New or updated metadata keys to merge in
   */
  async updateMetadata(
    strategyId: number,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db
      .update(strategies)
      .set({
        metadata: sql`coalesce(${strategies.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(strategies.id, strategyId));
  }

  /**
   * Get all strategies, optionally including killed ones.
   *
   * @param includeKilled - When false (default), excludes strategies with status='killed'
   * @returns Strategies ordered by createdAt ascending
   */
  async getStrategies(includeKilled = false): Promise<Strategy[]> {
    if (includeKilled) {
      return this.db
        .select()
        .from(strategies)
        .orderBy(asc(strategies.createdAt));
    }

    return this.db
      .select()
      .from(strategies)
      .where(sql`${strategies.status} != 'killed'`)
      .orderBy(asc(strategies.createdAt));
  }

  /**
   * Find a strategy by its associated goal ID.
   *
   * Not all goals have strategies — returns null when no strategy is linked
   * to the given goal.
   *
   * @param goalId - The goal ID to look up
   * @returns The strategy row, or null if no strategy is linked to this goal
   */
  async getStrategyByGoalId(goalId: number): Promise<Strategy | null> {
    const rows = await this.db
      .select()
      .from(strategies)
      .where(eq(strategies.goalId, goalId))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Get all strategies that are still actionable (not killed or completed).
   *
   * Includes: 'hypothesis', 'testing', 'active', 'paused'.
   * Excludes: 'killed', 'completed'.
   *
   * @returns Active strategies ordered by createdAt ascending
   */
  async getActiveStrategies(): Promise<Strategy[]> {
    return this.db
      .select()
      .from(strategies)
      .where(sql`${strategies.status} NOT IN ('killed', 'completed')`)
      .orderBy(asc(strategies.createdAt));
  }
}
