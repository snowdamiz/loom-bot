import { integer, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * COST-03: Revenue tracking table.
 * Schema only — populated in later phases when strategy execution generates returns.
 * Used for strategy P&L tracking and performance attribution.
 */
export const revenue = pgTable('revenue', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  strategyId: text('strategy_id').notNull(),
  sourceAttribution: text('source_attribution'),
  // Financial values use exact decimal (numeric), not float, for precision
  amountUsd: numeric('amount_usd', { precision: 12, scale: 8 }).notNull(),
  earnedAt: timestamp('earned_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Revenue = typeof revenue.$inferSelect;
export type NewRevenue = typeof revenue.$inferInsert;
