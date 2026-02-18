import { sendOperatorDm } from '@jarvis/ai';
import { DbClient } from '@jarvis/db';
import { getActiveSpendLimit } from './limits.js';

/**
 * Send a Discord DM to the operator when spend limits are breached.
 *
 * Non-fatal: if DISCORD_BOT_TOKEN or DISCORD_OPERATOR_USER_ID are missing,
 * logs to stderr and returns without throwing. Discord failure must never
 * block governance decisions — per established pattern from Phase 2/3.
 */
export async function notifySpendLimitBreach(
  reason: string,
  amountLamports: bigint,
  purpose: string,
): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const operatorUserId = process.env.DISCORD_OPERATOR_USER_ID;

  if (!token || !operatorUserId) {
    process.stderr.write(
      `[wallet/notify] DISCORD_BOT_TOKEN or DISCORD_OPERATOR_USER_ID not set — skipping spend limit breach notification\n`,
    );
    return;
  }

  const message =
    `[WALLET] Spend limit breached: ${reason}. ` +
    `Transaction: ${amountLamports.toString()} lamports for '${purpose}'`;

  try {
    await sendOperatorDm(token, operatorUserId, message);
  } catch (err) {
    // Discord failure is non-fatal — governance decision was already made
    process.stderr.write(
      `[wallet/notify] Failed to send spend limit breach Discord DM: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

/**
 * Send a Discord DM to the operator for high-value transactions.
 *
 * Reads the notifyAboveLamports threshold from the active spend_limits row.
 * If no active limit row exists, or if the amount is below threshold, no DM is sent.
 *
 * Non-fatal: if Discord env vars are missing or Discord call fails, logs to stderr only.
 */
export async function notifyHighValueTransaction(
  amountLamports: bigint,
  destination: string,
  purpose: string,
  db: DbClient,
): Promise<void> {
  const limit = await getActiveSpendLimit(db);
  if (limit === null) return;

  const threshold = BigInt(limit.notifyAboveLamports);
  if (amountLamports <= threshold) return;

  const token = process.env.DISCORD_BOT_TOKEN;
  const operatorUserId = process.env.DISCORD_OPERATOR_USER_ID;

  if (!token || !operatorUserId) {
    process.stderr.write(
      `[wallet/notify] DISCORD_BOT_TOKEN or DISCORD_OPERATOR_USER_ID not set — skipping high-value transaction notification\n`,
    );
    return;
  }

  const message =
    `[WALLET] High-value transaction: ${amountLamports.toString()} lamports ` +
    `to ${destination} for '${purpose}'`;

  try {
    await sendOperatorDm(token, operatorUserId, message);
  } catch (err) {
    process.stderr.write(
      `[wallet/notify] Failed to send high-value transaction Discord DM: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}
