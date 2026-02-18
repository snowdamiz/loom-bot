import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * DATA-05: Long-term memory facts store.
 * Stores structured knowledge the agent accumulates over time.
 * The JSONB body contains: learned, confidence, source fields.
 */
export const memoryFacts = pgTable('memory_facts', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  subject: text('subject').notNull(),
  // JSONB body: { learned: string, confidence: number, source: string }
  body: jsonb('body').notNull(),
  isStale: boolean('is_stale').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type MemoryFact = typeof memoryFacts.$inferSelect;
export type NewMemoryFact = typeof memoryFacts.$inferInsert;
