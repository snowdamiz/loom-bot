import type { DbClient } from '@jarvis/db';
import { planningCycles } from '@jarvis/db';

/**
 * LOG-03, LOG-05: Planning cycle lifecycle logging with two-row append-only pattern.
 *
 * Same append-only pattern as tool_calls:
 * - logCycleStart inserts an "active" row and returns its id.
 * - logCycleComplete inserts a "completed" row with parentId — NEVER updates the active row.
 */

/**
 * Insert an "active" planning cycle row when a cycle begins.
 * Returns the inserted row id, which must be passed to logCycleComplete.
 *
 * @param params.goals - JSONB goals the agent intends to accomplish this cycle
 * @returns The inserted row id
 */
export async function logCycleStart(
  db: DbClient,
  params: { goals: unknown }
): Promise<number> {
  const rows = await db
    .insert(planningCycles)
    .values({
      goals: params.goals as Record<string, unknown>,
      status: 'active',
      startedAt: new Date(),
    })
    .returning({ id: planningCycles.id });

  const row = rows[0];
  if (!row) {
    throw new Error('logCycleStart: insert returned no rows');
  }
  return row.id;
}

/**
 * Insert a "completed" planning cycle row when a cycle ends.
 * Creates a NEW row (LOG-05 append-only) — NEVER updates the original active row.
 *
 * @param params.parentId - The id returned by logCycleStart
 * @param params.outcomes - JSONB outcomes/results of the completed cycle
 * @returns The inserted row id
 */
export async function logCycleComplete(
  db: DbClient,
  params: { parentId: number; outcomes: unknown }
): Promise<number> {
  const rows = await db
    .insert(planningCycles)
    .values({
      parentId: params.parentId,
      goals: {} as Record<string, unknown>,
      status: 'completed',
      outcomes: params.outcomes as Record<string, unknown>,
      startedAt: new Date(),
      completedAt: new Date(),
    })
    .returning({ id: planningCycles.id });

  const row = rows[0];
  if (!row) {
    throw new Error('logCycleComplete: insert returned no rows');
  }
  return row.id;
}
