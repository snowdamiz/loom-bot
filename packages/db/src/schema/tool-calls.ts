import { AnyPgColumn, integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * LOG-02, LOG-04: Tool call execution log with JSONB input/output.
 *
 * LOG-05 (append-only compliance): This table uses a two-row pattern.
 * When a tool is invoked, a "started" row is inserted (status='started').
 * That row is NEVER updated. When the tool completes, a separate row is
 * inserted with status='completed' or 'failed' and a parentId referencing
 * the started row. This preserves a strict append-only audit trail.
 */
export const toolCalls = pgTable('tool_calls', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  // For completion/failure rows: references the originating 'started' row.
  // null for the initial 'started' row.
  parentId: integer('parent_id').references((): AnyPgColumn => toolCalls.id),
  toolName: varchar('tool_name', { length: 128 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('started'),
  // JSONB: full input arguments passed to the tool
  input: jsonb('input').notNull(),
  // JSONB: full output returned by the tool (null on error or in-progress)
  output: jsonb('output'),
  error: text('error'),
  durationMs: integer('duration_ms'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

export type ToolCall = typeof toolCalls.$inferSelect;
export type NewToolCall = typeof toolCalls.$inferInsert;
