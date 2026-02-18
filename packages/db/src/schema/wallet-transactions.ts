import { integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * WALLET-06: Wallet transaction audit table.
 * Records every attempted or completed transaction with purpose tracking
 * for AI spend accountability and audit trail.
 */
export const walletTxStatusEnum = pgEnum('wallet_tx_status', [
  'submitted',
  'confirmed',
  'failed',
  'rejected',
]);

export const walletTransactions = pgTable('wallet_transactions', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  /** Solana transaction signature — null until successfully submitted to network */
  txSignature: text('tx_signature'),
  /** SPL token mint address, or 'sol' for native SOL */
  tokenMint: text('token_mint').notNull().default('sol'),
  /** Destination wallet address — null for rejected or inbound transactions */
  destinationAddress: text('destination_address'),
  /** Amount in lamports stored as text for BigInt safety (no precision loss) */
  amountLamports: text('amount_lamports').notNull(),
  /** AI self-reported purpose for the transaction — required for WALLET-06 accountability */
  purpose: text('purpose').notNull(),
  status: walletTxStatusEnum('status').notNull().default('submitted'),
  /** Human or system-supplied reason when status='rejected' */
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  /** Set when status transitions to 'confirmed' after on-chain finality */
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
});

export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type NewWalletTransaction = typeof walletTransactions.$inferInsert;
