import { agentState, eq } from '@jarvis/db';
import type { DbClient } from '@jarvis/db';

/**
 * RECOV-01: Journal checkpoint system.
 *
 * Persists sub-goal completion checkpoints to the agent_state table so that
 * on process restart, the agent can read the journal and resume from the last
 * completed sub-goal without re-executing already-completed work.
 *
 * Pitfall 3 (from research): The checkpoint write MUST succeed before the agent
 * proceeds to the next sub-goal. If the write fails, we halt rather than silently
 * skip — a missed checkpoint causes duplicate execution on crash recovery.
 */

export interface JournalEntry {
  subGoalId: number;
  goalId: number;
  completedAt: string; // ISO timestamp
  outcome: unknown;    // what was produced
  status: 'completed' | 'failed' | 'skipped';
}

/**
 * Write a checkpoint entry to the journal for a given goal.
 *
 * MANDATORY SUCCESS: Retries up to 3 times with 500ms delay between attempts.
 * If all 3 attempts fail, throws an error that halts the agent loop for this goal.
 * Do NOT silently skip — a missed checkpoint means replay will re-execute the
 * sub-goal on crash recovery, causing duplicates.
 *
 * @param db      - Database client
 * @param goalId  - The parent goal's ID (used as journal key)
 * @param entry   - The journal entry to append
 */
export async function checkpoint(
  db: DbClient,
  goalId: number,
  entry: JournalEntry,
): Promise<void> {
  const journalKey = `journal:${goalId}`;
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 500;

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Read existing journal entries
      const existing = await db
        .select()
        .from(agentState)
        .where(eq(agentState.key, journalKey))
        .limit(1);

      const entries: JournalEntry[] =
        existing.length > 0
          ? (existing[0]!.value as JournalEntry[])
          : [];

      entries.push(entry);

      if (existing.length > 0) {
        // Update existing row
        await db
          .update(agentState)
          .set({ value: entries as unknown as Record<string, unknown>, updatedAt: new Date() })
          .where(eq(agentState.key, journalKey));
      } else {
        // Insert new row
        await db
          .insert(agentState)
          .values({ key: journalKey, value: entries as unknown as Record<string, unknown> });
      }

      // Success — return immediately
      return;
    } catch (err) {
      lastError = err;
      process.stderr.write(
        `[journal] Checkpoint write attempt ${attempt}/${MAX_RETRIES} failed for goal ${goalId}: ${err instanceof Error ? err.message : String(err)}\n`,
      );

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  // All retries exhausted — halt the agent loop for this goal
  throw new Error(
    `[journal] Checkpoint write failed after ${MAX_RETRIES} attempts for goal ${goalId}. Halting to prevent uncheckpointed progress. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/**
 * Read all journal entries for a given goal.
 *
 * Used by startup recovery to determine what sub-goals were already completed
 * before the process crashed.
 *
 * @param db     - Database client
 * @param goalId - The parent goal's ID
 * @returns Array of journal entries, or empty array if no journal exists
 */
export async function readJournal(
  db: DbClient,
  goalId: number,
): Promise<JournalEntry[]> {
  const journalKey = `journal:${goalId}`;

  const rows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, journalKey))
    .limit(1);

  if (rows.length === 0) {
    return [];
  }

  return rows[0]!.value as JournalEntry[];
}

/**
 * Delete the journal for a given goal.
 *
 * Called when a goal completes successfully or is abandoned — cleanup prevents
 * stale journal entries from confusing future recovery runs.
 *
 * @param db     - Database client
 * @param goalId - The parent goal's ID
 */
export async function clearJournal(
  db: DbClient,
  goalId: number,
): Promise<void> {
  const journalKey = `journal:${goalId}`;

  await db
    .delete(agentState)
    .where(eq(agentState.key, journalKey));
}

/**
 * Get the set of sub-goal IDs that have been completed (status='completed').
 *
 * Convenience function for startup recovery — allows the recovery module to
 * quickly determine which sub-goals can be skipped when resuming.
 *
 * @param db     - Database client
 * @param goalId - The parent goal's ID
 * @returns Set of sub-goal IDs with status='completed'
 */
export async function getCompletedSubGoalIds(
  db: DbClient,
  goalId: number,
): Promise<Set<number>> {
  const entries = await readJournal(db, goalId);
  const completedIds = new Set<number>();

  for (const entry of entries) {
    if (entry.status === 'completed') {
      completedIds.add(entry.subGoalId);
    }
  }

  return completedIds;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
