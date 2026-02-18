import { integer, numeric, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * MODL-02, COST-01: AI call logging table.
 * Every AI completion call is logged here with model, tier, tokens, and cost.
 * Used for cost tracking, auditing, and performance analysis.
 */
export const aiCalls = pgTable('ai_calls', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  model: varchar('model', { length: 128 }).notNull(),
  tier: varchar('tier', { length: 32 }).notNull(), // 'strong' | 'mid' | 'cheap'
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  // Financial values use exact decimal (numeric), not float, for precision
  costUsd: numeric('cost_usd', { precision: 12, scale: 8 }).notNull(),
  // Optional link to planning cycle
  goalId: integer('goal_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type AiCall = typeof aiCalls.$inferSelect;
export type NewAiCall = typeof aiCalls.$inferInsert;
