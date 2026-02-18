import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * WALLET-04: Runtime-mutable spend governance limits.
 * Stores per-transaction and daily aggregate ceilings as text (BigInt-safe lamports).
 * Only one row should be active at a time; updated rows should set active=false
 * and a new row inserted to preserve the change history.
 */
export const spendLimits = pgTable('spend_limits', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  /** Maximum lamports allowed per single transaction — stored as text for BigInt safety */
  perTransactionLamports: text('per_transaction_lamports').notNull(),
  /** Maximum cumulative lamports allowed in a rolling 24-hour window */
  dailyAggregateLamports: text('daily_aggregate_lamports').notNull(),
  /** Operator notification threshold — send alert when a tx exceeds this amount */
  notifyAboveLamports: text('notify_above_lamports').notNull(),
  /** Only one row should be active; false for historical/superseded limits */
  active: boolean('active').notNull().default(true),
  /** Optional human-readable description of why these limits were set */
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type SpendLimit = typeof spendLimits.$inferSelect;
export type NewSpendLimit = typeof spendLimits.$inferInsert;
