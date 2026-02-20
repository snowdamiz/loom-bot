import { integer, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * SEXT-14: Append-only self-extension lifecycle event ledger.
 *
 * IMPORTANT:
 * - Rows in this table are insert-only audit events.
 * - Callers must never update or delete existing rows.
 * - New lifecycle state is represented by inserting a new event row.
 */
export const selfExtensionEvents = pgTable('self_extension_events', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  runId: varchar('run_id', { length: 128 }).notNull(),
  correlationId: varchar('correlation_id', { length: 128 }),
  stage: varchar('stage', { length: 64 }).notNull(),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  actorSource: varchar('actor_source', { length: 64 }).notNull(),
  toolName: varchar('tool_name', { length: 128 }),
  toolCallId: varchar('tool_call_id', { length: 128 }),
  goalId: varchar('goal_id', { length: 64 }),
  cycleId: varchar('cycle_id', { length: 64 }),
  subGoalId: varchar('sub_goal_id', { length: 64 }),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type SelfExtensionEvent = typeof selfExtensionEvents.$inferSelect;
export type NewSelfExtensionEvent = typeof selfExtensionEvents.$inferInsert;
