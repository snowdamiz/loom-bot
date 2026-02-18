import { integer, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * DATA-01: Agent state key-value store.
 * Supports JSONB values that persist across container restarts.
 * Used by the agent to save and restore operational state.
 */
export const agentState = pgTable('agent_state', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  key: varchar('key', { length: 256 }).notNull().unique(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type AgentState = typeof agentState.$inferSelect;
export type NewAgentState = typeof agentState.$inferInsert;
