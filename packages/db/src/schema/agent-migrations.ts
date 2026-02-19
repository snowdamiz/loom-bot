import { integer, text, timestamp, pgTable } from 'drizzle-orm/pg-core';

/**
 * EXTEND-01: Agent-authored migration tracking table.
 *
 * Tracks DDL migrations applied by the agent's self-extension capabilities.
 * Each row records a named migration with the exact SQL executed, providing
 * a full audit trail for any schema changes the agent makes autonomously.
 */
export const agentMigrations = pgTable('agent_migrations', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  /** Human-readable migration name, e.g. 'create_agent_x402_transactions' */
  migrationName: text('migration_name').notNull().unique(),
  /** The exact DDL SQL executed — for audit and re-creation purposes */
  sqlExecuted: text('sql_executed').notNull(),
  appliedAt: timestamp('applied_at').defaultNow().notNull(),
});

export type AgentMigration = typeof agentMigrations.$inferSelect;
export type NewAgentMigration = typeof agentMigrations.$inferInsert;
