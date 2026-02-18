import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * LOG-01, LOG-04: Decision log with JSONB reasoning (chain-of-thought).
 * Every agent decision is recorded here with its full reasoning chain.
 * The cycleId links decisions to planning cycles for traceability.
 */
export const decisionLog = pgTable('decision_log', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  // References planning_cycles.id — nullable since decisions may occur outside cycles
  cycleId: integer('cycle_id'),
  // JSONB: full chain-of-thought reasoning that led to this decision
  reasoning: jsonb('reasoning').notNull(),
  decision: text('decision').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type DecisionLogEntry = typeof decisionLog.$inferSelect;
export type NewDecisionLogEntry = typeof decisionLog.$inferInsert;
