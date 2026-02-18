import { integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

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
