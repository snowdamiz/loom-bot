import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Wallet configuration key-value store.
 * All Solana configuration (RPC URL, wallet public key, Jupiter API key, etc.)
 * is stored here rather than in env vars — allows runtime updates without redeploy.
 *
 * Canonical keys: 'rpc_url', 'wss_url', 'wallet_public_key', 'jupiter_api_key'
 */
export const walletConfig = pgTable('wallet_config', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  /** Configuration key — unique identifier, e.g. 'rpc_url', 'wallet_public_key' */
  key: text('key').notNull().unique(),
  /** Configuration value as text */
  value: text('value').notNull(),
  /** Optional human-readable description of what this config entry controls */
  description: text('description'),
  /** Whether this config entry is currently active and in use */
  active: boolean('active').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type WalletConfig = typeof walletConfig.$inferSelect;
export type NewWalletConfig = typeof walletConfig.$inferInsert;
