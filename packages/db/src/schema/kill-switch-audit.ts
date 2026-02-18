import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * KILL-01: Kill switch audit trail.
 * Records every activation/deactivation of the kill switch for accountability.
 */
export const killSwitchAudit = pgTable('kill_switch_audit', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  action: text('action').notNull(), // 'activate' | 'deactivate'
  reason: text('reason').notNull(),
  triggeredBy: text('triggered_by').notNull(), // 'cli' | 'api' | 'agent'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type KillSwitchAudit = typeof killSwitchAudit.$inferSelect;
export type NewKillSwitchAudit = typeof killSwitchAudit.$inferInsert;
