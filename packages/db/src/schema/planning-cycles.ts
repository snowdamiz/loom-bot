import { AnyPgColumn, integer, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * LOG-03, LOG-04: Planning cycle lifecycle tracking with JSONB goals/outcomes.
 *
 * LOG-05 (append-only compliance): This table uses the same two-row pattern
 * as tool_calls. An active cycle is inserted with status='active'. That row is
 * NEVER updated. When the cycle completes, a new row is inserted with
 * status='completed' and a parentId referencing the original active row.
 * This preserves immutable history of all planning activity.
 */
export const planningCycles = pgTable('planning_cycles', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  // For completion rows: references the originating 'active' cycle row.
  // null for the initial 'active' row.
  parentId: integer('parent_id').references((): AnyPgColumn => planningCycles.id),
  // JSONB: array of goal objects the agent set out to achieve
  goals: jsonb('goals').notNull(),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  // JSONB: results/outcomes once the cycle completes (null while active)
  outcomes: jsonb('outcomes'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export type PlanningCycle = typeof planningCycles.$inferSelect;
export type NewPlanningCycle = typeof planningCycles.$inferInsert;
