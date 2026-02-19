import { integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * LOOP-01: Goal lifecycle tracking table.
 * Goals persist across agent restarts and represent top-level objectives
 * the agent is working toward. Source distinguishes operator-injected goals
 * from ones the agent discovered autonomously.
 */
export const goals = pgTable('goals', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  /** Origin of the goal: operator-injected via CLI or agent-discovered during planning */
  source: varchar('source', { length: 32 }).notNull(), // 'operator-injected' | 'agent-discovered'
  description: text('description').notNull(),
  /** Lifecycle status of the goal */
  status: varchar('status', { length: 32 }).notNull().default('active'), // 'active' | 'paused' | 'completed' | 'abandoned'
  /** How many times the agent has re-planned for this goal due to failure or new info */
  replanCount: integer('replan_count').notNull().default(0),
  /** 0 = highest priority; used to sort active goals before planning */
  priority: integer('priority').notNull().default(50),
  /** Human-readable reason shown in operator UI when status='paused' */
  pauseReason: text('pause_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;

/**
 * LOOP-01, MULTI-05: Sub-goal decomposition table.
 * A goal is broken into sub-goals during planning. Sub-goals can depend on
 * each other (dependsOn tracks prerequisite sub-goal IDs). When a sub-goal
 * requires a specialized agent, agentJobId links it to the BullMQ job.
 *
 * Co-located with goals to avoid cross-file imports that break drizzle-kit's
 * CJS bundler (`.js` extension cannot resolve back to `.ts` at bundle time).
 */
export const subGoals = pgTable('sub_goals', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  /** Parent goal this sub-goal belongs to */
  goalId: integer('goal_id').references(() => goals.id).notNull(),
  description: text('description').notNull(),
  /** Array of sub_goal IDs that must complete before this one can start */
  dependsOn: jsonb('depends_on').notNull().default([]),
  /** Execution status of this sub-goal */
  status: varchar('status', { length: 32 }).notNull().default('pending'), // 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped'
  /** JSONB result produced by this sub-goal — available after status='completed' */
  outcome: jsonb('outcome'),
  /** BullMQ job ID if this sub-goal was delegated to a specialized sub-agent */
  agentJobId: varchar('agent_job_id', { length: 128 }),
  /** 0 = highest priority within the parent goal */
  priority: integer('priority').notNull().default(50),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export type SubGoal = typeof subGoals.$inferSelect;
export type NewSubGoal = typeof subGoals.$inferInsert;

/**
 * STRAT-03, STRAT-06: Strategy lifecycle tracking table.
 *
 * A strategy IS a goal with additional metadata — every strategy has a 1:1
 * reference to a goal row via goalId FK. The strategy engine is domain-agnostic:
 * no financial columns, no domain-specific columns exist here. All domain data
 * (capital, platform, approach, metrics, etc.) lives in the `metadata` jsonb column.
 *
 * Co-located with goals.ts to avoid cross-file .js imports that break drizzle-kit's
 * CJS bundler (`.js` extension cannot resolve back to `.ts` at bundle time).
 *
 * Lifecycle states:
 *   'hypothesis' → strategy idea, not yet tested
 *   'testing'    → agent is actively evaluating the strategy
 *   'active'     → strategy is proven and being executed
 *   'paused'     → temporarily halted (e.g. awaiting external event)
 *   'killed'     → abandoned — did not work or is no longer viable
 *   'completed'  → goal fully achieved
 */
export const strategies = pgTable('strategies', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  /** 1:1 FK to goals.id — a strategy IS a goal with strategy metadata */
  goalId: integer('goal_id').references(() => goals.id).notNull(),
  /** LLM-generated description of what this strategy is and why it will work */
  hypothesis: text('hypothesis').notNull(),
  /** Lifecycle state of the strategy */
  status: varchar('status', { length: 32 }).notNull().default('hypothesis'),
  /** LLM-supplied reasoning for the most recent lifecycle transition */
  lastTransitionReason: text('last_transition_reason'),
  /** Free-form strategy-specific context — agent stores domain data here */
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Strategy = typeof strategies.$inferSelect;
export type NewStrategy = typeof strategies.$inferInsert;
