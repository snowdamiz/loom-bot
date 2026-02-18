import { integer, numeric, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * COST-02: Operating costs tracking table.
 * Records all operational expenditures by category for P&L tracking.
 */
export const costCategoryEnum = pgEnum('cost_category', [
  'ai_inference',
  'vm',
  'api_service',
  'other',
]);

export const operatingCosts = pgTable('operating_costs', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  category: costCategoryEnum('category').notNull(),
  // Financial values use exact decimal (numeric), not float, for precision
  amountUsd: numeric('amount_usd', { precision: 12, scale: 8 }).notNull(),
  description: text('description'),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type OperatingCost = typeof operatingCosts.$inferSelect;
export type NewOperatingCost = typeof operatingCosts.$inferInsert;
