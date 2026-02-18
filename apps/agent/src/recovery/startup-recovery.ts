import { goals, planningCycles, subGoals, eq } from '@jarvis/db';
import type { DbClient } from '@jarvis/db';
import { readJournal } from './journal.js';
import { sendOperatorDm } from '@jarvis/ai';
import type { Supervisor } from '../multi-agent/supervisor.js';

/**
 * RECOV-02, RECOV-03, RECOV-04: Startup recovery module.
 *
 * On agent process restart, detects interrupted work (active goals/cycles),
 * sends a Discord DM alert to the operator, handles incomplete planning cycles,
 * resets in-progress sub-goals for re-evaluation, and restarts main agents
 * via the supervisor's staggered restart to avoid resource spikes.
 *
 * Dependency: Postgres-backed journal + BullMQ Redis persist across Fly.io restarts.
 * Fly.io `restart: always` policy ensures the process relaunches on crash.
 */

/**
 * Detect whether this is a crash recovery scenario.
 *
 * Returns true if there are active goals in the database, indicating the
 * process was restarted while goals were in-flight.
 *
 * @param db - Database client
 * @returns true if active goals exist (recovery scenario), false for clean start
 */
export async function detectCrashRecovery(db: DbClient): Promise<boolean> {
  const activeGoals = await db
    .select({ id: goals.id })
    .from(goals)
    .where(eq(goals.status, 'active'))
    .limit(1);

  return activeGoals.length > 0;
}

/**
 * Perform full startup recovery after a crash.
 *
 * Steps:
 * 1. Detect interrupted work (active goals + active planning cycles)
 * 2. Send Discord DM alert to operator (non-fatal if tokens not configured)
 * 3. Handle incomplete planning cycles (RECOV-04): mark as 'interrupted'
 * 4. Reset in-progress sub-goals to 'pending' for re-evaluation (RECOV-02)
 * 5. Trigger staggered restart via supervisor (locked decision)
 *
 * @param db         - Database client
 * @param supervisor - Supervisor instance to coordinate staggered restart
 * @param config     - Optional Discord credentials for operator alert
 * @returns Count of recovered goals and escalated (non-recoverable) goals
 */
export async function performStartupRecovery(
  db: DbClient,
  supervisor: Supervisor,
  config?: { discordBotToken?: string; discordOperatorUserId?: string },
): Promise<{ recovered: number; escalated: number }> {
  // Step 1 — Detect interrupted work
  const activeGoals = await db
    .select()
    .from(goals)
    .where(eq(goals.status, 'active'));

  const activeCycles = await db
    .select()
    .from(planningCycles)
    .where(eq(planningCycles.status, 'active'));

  if (activeGoals.length === 0 && activeCycles.length === 0) {
    // Clean start — no recovery needed
    return { recovered: 0, escalated: 0 };
  }

  process.stderr.write(
    `[recovery] Crash recovery detected: ${activeGoals.length} active goals, ${activeCycles.length} active cycles.\n`,
  );

  // Step 2 — Send Discord DM alert (non-fatal)
  if (config?.discordBotToken && config?.discordOperatorUserId) {
    try {
      await sendOperatorDm(
        config.discordBotToken,
        config.discordOperatorUserId,
        `[Jarvis] Crash recovery: restarting ${activeGoals.length} active goals.`,
      );
      process.stderr.write('[recovery] Discord DM alert sent to operator.\n');
    } catch (err) {
      // Non-fatal: Discord DM failure does not block recovery
      process.stderr.write(
        `[recovery] Discord DM alert failed (non-fatal): ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  } else {
    process.stderr.write(
      '[recovery] Discord DM not sent — DISCORD_BOT_TOKEN or DISCORD_OPERATOR_USER_ID not configured.\n',
    );
  }

  // Step 3 — Handle incomplete planning cycles (RECOV-04)
  // Per LOG-05 two-row pattern: mark interrupted cycles by inserting a completion row
  // with status='interrupted'. The original 'active' row is never updated (append-only).
  for (const cycle of activeCycles) {
    try {
      await db.insert(planningCycles).values({
        parentId: cycle.id,
        goals: cycle.goals,
        status: 'interrupted',
        outcomes: { reason: 'Process restarted during active planning cycle' },
        completedAt: new Date(),
      });
      process.stderr.write(
        `[recovery] Planning cycle ${cycle.id} marked as interrupted (LOG-05 two-row pattern).\n`,
      );
    } catch (err) {
      process.stderr.write(
        `[recovery] Failed to mark cycle ${cycle.id} as interrupted: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  // Step 4 — Re-evaluate partially completed sub-goals
  // Sub-goals with status='in-progress' at crash time were interrupted mid-execution.
  // Reset them to 'pending' so the agent loop re-evaluates them on the next cycle.
  // The evaluator will determine if prior partial work is still valid.
  let escalated = 0;

  for (const goal of activeGoals) {
    try {
      // Read the journal to understand what was completed before the crash
      const journalEntries = await readJournal(db, goal.id);
      const completedIds = new Set(
        journalEntries
          .filter((e) => e.status === 'completed')
          .map((e) => e.subGoalId),
      );

      // Find in-progress sub-goals for this goal
      const inProgressSubGoals = await db
        .select()
        .from(subGoals)
        .where(eq(subGoals.goalId, goal.id));

      const interruptedSubGoals = inProgressSubGoals.filter(
        (sg) => sg.status === 'in-progress',
      );

      for (const sg of interruptedSubGoals) {
        // Only reset if NOT already recorded as completed in the journal
        if (!completedIds.has(sg.id)) {
          await db
            .update(subGoals)
            .set({ status: 'pending' })
            .where(eq(subGoals.id, sg.id));

          process.stderr.write(
            `[recovery] Sub-goal #${sg.id} was in-progress at crash time, reset to pending for re-evaluation.\n`,
          );
        }
      }
    } catch (err) {
      process.stderr.write(
        `[recovery] Failed to reset sub-goals for goal ${goal.id}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      escalated++;
    }
  }

  // Step 5 — Staggered restart via supervisor
  // Spawns main agents with delay between each to avoid resource spikes (locked decision)
  try {
    await supervisor.staggeredRestart();
  } catch (err) {
    process.stderr.write(
      `[recovery] Staggered restart failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    escalated++;
  }

  const recovered = Math.max(0, activeGoals.length - escalated);
  process.stderr.write(
    `[recovery] Recovery complete: ${recovered} goals resumed, ${escalated} escalated.\n`,
  );

  return { recovered, escalated };
}
