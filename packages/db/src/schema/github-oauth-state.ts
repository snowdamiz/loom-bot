import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * One-time GitHub OAuth flow state for CSRF + PKCE verification.
 */
export const oauthState = pgTable('oauth_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  stateHash: varchar('state_hash', { length: 128 }).notNull().unique(),
  codeVerifier: text('code_verifier').notNull(),
  returnTo: text('return_to'),
  expiresAt: timestamp('expires_at').notNull(),
  consumedAt: timestamp('consumed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type OAuthState = typeof oauthState.$inferSelect;
export type NewOAuthState = typeof oauthState.$inferInsert;
