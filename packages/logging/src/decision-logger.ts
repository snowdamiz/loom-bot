import type { DbClient } from '@jarvis/db';
import { decisionLog } from '@jarvis/db';

/**
 * LOG-01, LOG-04: Agent decision logging with full chain-of-thought reasoning.
 *
 * Every agent decision must be recorded here with its complete LLM reasoning —
 * not a summary, but the full chain-of-thought that led to the decision.
 */

/**
 * Insert a decision log entry with full chain-of-thought reasoning as JSONB.
 *
 * @param params.cycleId - Optional planning cycle this decision belongs to
 * @param params.reasoning - Full LLM chain-of-thought (complete, not summarized)
 * @param params.decision - The decision text/action taken
 * @returns The inserted row id
 */
export async function logDecision(
  db: DbClient,
  params: { cycleId?: number; reasoning: unknown; decision: string }
): Promise<number> {
  const rows = await db
    .insert(decisionLog)
    .values({
      cycleId: params.cycleId ?? null,
      reasoning: params.reasoning as Record<string, unknown>,
      decision: params.decision,
      createdAt: new Date(),
    })
    .returning({ id: decisionLog.id });

  const row = rows[0];
  if (!row) {
    throw new Error('logDecision: insert returned no rows');
  }
  return row.id;
}
