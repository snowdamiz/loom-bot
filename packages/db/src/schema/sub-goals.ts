import { integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { goals } from './goals.js';

/**
 * LOOP-01, MULTI-05: Sub-goal decomposition table.
 * A goal is broken into sub-goals during planning. Sub-goals can depend on
 * each other (dependsOn tracks prerequisite sub-goal IDs). When a sub-goal
 * requires a specialized agent, agentJobId links it to the BullMQ job.
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
