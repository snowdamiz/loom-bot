import { DbClient, spendLimits, walletTransactions, sql, eq } from '@jarvis/db';
import type { SpendLimit } from '@jarvis/db';

export type { SpendLimit };

/**
 * Result of a spend limit check.
 * allowed=true means the transaction may proceed.
 * allowed=false includes a human-readable reason for rejection.
 */
export interface SpendCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Load the currently active spend limit row, or null if no limits are configured.
 * Per locked decision: "high generous defaults" — no active limit means allow everything.
 */
export async function getActiveSpendLimit(
  db: DbClient,
): Promise<SpendLimit | null> {
  const rows = await db
    .select()
    .from(spendLimits)
    .where(eq(spendLimits.active, true))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Calculate the rolling 24-hour aggregate spend in lamports.
 * Uses a rolling window (NOW() - INTERVAL '24 hours') per research recommendation —
 * avoids timezone ambiguity that a calendar-day reset would introduce.
 *
 * Only counts submitted and confirmed transactions — failed/rejected do not consume budget.
 */
export async function getTodaySpentLamports(db: DbClient): Promise<bigint> {
  const rows = await db
    .select({
      total: sql<string>`coalesce(sum(${walletTransactions.amountLamports}::numeric), '0')`,
    })
    .from(walletTransactions)
    .where(
      sql`${walletTransactions.status} IN ('submitted', 'confirmed')
          AND ${walletTransactions.createdAt} >= NOW() - INTERVAL '24 hours'`,
    );

  const total = rows[0]?.total ?? '0';
  return BigInt(Math.round(parseFloat(total)));
}

/**
 * Check whether a proposed transaction amount passes all active spend limits.
 *
 * Checks in order:
 *   1. Per-transaction ceiling — rejects if single tx exceeds limit
 *   2. Daily rolling aggregate — rejects if cumulative spend would breach limit
 *
 * If no active limit row exists, all transactions are allowed.
 * tokenMint is accepted for future extension (e.g., per-token limits) but not yet used.
 */
export async function checkSpendLimits(
  db: DbClient,
  amountLamports: bigint,
  tokenMint?: string,
): Promise<SpendCheckResult> {
  // Suppress unused variable warning for future extension param
  void tokenMint;

  const limit = await getActiveSpendLimit(db);

  // No active limits configured — allow everything (high generous defaults)
  if (limit === null) {
    return { allowed: true };
  }

  // Per-transaction check
  const perTxCeiling = BigInt(limit.perTransactionLamports);
  if (amountLamports > perTxCeiling) {
    return {
      allowed: false,
      reason: `Exceeds per-transaction limit of ${perTxCeiling.toString()} lamports`,
    };
  }

  // Daily rolling aggregate check
  const dailyCeiling = BigInt(limit.dailyAggregateLamports);
  const todaySpent = await getTodaySpentLamports(db);

  if (todaySpent + amountLamports > dailyCeiling) {
    return {
      allowed: false,
      reason: `Would exceed daily aggregate limit of ${dailyCeiling.toString()} lamports (already spent ${todaySpent.toString()} today)`,
    };
  }

  return { allowed: true };
}
