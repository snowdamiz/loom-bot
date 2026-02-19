import { boolean, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Setup state tracking table.
 * Tracks whether the operator has completed the initial setup wizard:
 * 1. OpenRouter API key configured
 * 2. GitHub account connected (OAuth or stub)
 *
 * Only one row ever exists (id=1). Use upsert pattern.
 */
export const setupState = pgTable('setup_state', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  openrouterKeySet: boolean('openrouter_key_set').notNull().default(false),
  githubConnected: boolean('github_connected').notNull().default(false),
  githubUsername: varchar('github_username', { length: 256 }),
  setupCompletedAt: timestamp('setup_completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SetupState = typeof setupState.$inferSelect;
export type NewSetupState = typeof setupState.$inferInsert;
