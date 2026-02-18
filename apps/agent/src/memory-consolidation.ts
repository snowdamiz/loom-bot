import type { DbClient } from '@jarvis/db';
import { agentState, memoryFacts, toolCalls, eq, and, gt } from '@jarvis/db';

/**
 * DATA-06: Periodic memory consolidation job.
 *
 * Reads recent successful tool call results from tool_calls that have not yet
 * been consolidated, and distills them into structured knowledge facts in memory_facts.
 *
 * Design principles:
 * - Facts are PERMANENT: once written, never deleted (isStale can be set but rows persist)
 *   No DELETE statements exist in this file.
 * - Idempotent: tracks last consolidation timestamp in agent_state ('memory:last_consolidation')
 *   to avoid reprocessing already-consolidated results
 * - Simple for Phase 1: groups recent results by tool name, one fact per batch
 *   In later phases, LLM will produce smarter semantic summaries
 *
 * Fact body schema:
 * {
 *   learned: string,         // Summary of what was learned
 *   confidence: number,      // 0.0-1.0 (1.0 for direct observations)
 *   source: string,          // "tool:{toolName}"
 *   sourceTimestamp: string, // ISO timestamp of the original event
 *   rawIds: number[],        // IDs of the source tool_calls rows
 * }
 */

/**
 * Core consolidation logic. Queries unprocessed tool results and writes facts.
 * Called by startConsolidation on each interval tick and once at startup.
 *
 * @param db - Drizzle DbClient instance
 */
async function consolidate(db: DbClient): Promise<void> {
  try {
    // 1. Get the last consolidation timestamp from agent_state
    const lastRunRows = await db
      .select()
      .from(agentState)
      .where(eq(agentState.key, 'memory:last_consolidation'))
      .limit(1);

    const lastConsolidationTime: Date =
      lastRunRows.length > 0
        ? new Date((lastRunRows[0]!.value as { timestamp: string }).timestamp)
        : new Date(0); // Unix epoch = consolidate everything ever recorded

    // 2. Query successful tool_calls rows that are newer than the last consolidation timestamp.
    //    These are the "completion" rows (status='success') from the two-row append-only pattern.
    //    We filter by startedAt > lastConsolidationTime to get only unprocessed rows.
    const unprocessed = await db
      .select()
      .from(toolCalls)
      .where(
        and(
          eq(toolCalls.status, 'success'),
          gt(toolCalls.startedAt, lastConsolidationTime)
        )
      )
      .limit(100);

    if (unprocessed.length === 0) {
      process.stderr.write('[consolidation] No new tool results to consolidate.\n');
    } else {
      // 3. Group by tool name and create one fact per tool per batch.
      //    The "toolName" in success completion rows is 'completion' (from the two-row pattern).
      //    We need to look up the parent row's toolName to get the actual tool.
      //    For simplicity in Phase 1: use parentId to join to the started row's toolName.
      //    Since we stored the toolName on completion rows as 'completion', we get the
      //    actual toolName from the parentId's started row.
      //
      //    Implementation note: the tool-logger stores toolName='completion' on success rows.
      //    We query the parent rows to get real tool names.
      const parentIds = unprocessed
        .map((r) => r.parentId)
        .filter((id): id is number => id !== null);

      // If no parentIds (shouldn't happen with valid data), log and skip
      if (parentIds.length === 0) {
        process.stderr.write('[consolidation] No parent IDs found in success rows — skipping.\n');
      } else {
        // Fetch parent "started" rows to get actual tool names
        const parentRows = await db
          .select()
          .from(toolCalls)
          .where(eq(toolCalls.status, 'started'));

        // Build a map from parentId -> toolName
        const parentMap = new Map<number, string>();
        for (const parent of parentRows) {
          parentMap.set(parent.id, parent.toolName);
        }

        // Group success rows by actual tool name (from parent)
        type SuccessRow = (typeof unprocessed)[number];
        const byTool = new Map<string, SuccessRow[]>();

        for (const row of unprocessed) {
          if (row.parentId === null) continue;
          const actualToolName = parentMap.get(row.parentId) ?? 'unknown';
          if (!byTool.has(actualToolName)) {
            byTool.set(actualToolName, []);
          }
          byTool.get(actualToolName)!.push(row);
        }

        // 4. Insert a memory fact for each tool's batch
        for (const [toolName, rows] of byTool.entries()) {
          const rawIds = rows.map((r) => r.id);
          const latestRow = rows.at(-1)!;

          const factBody = {
            learned: `Tool "${toolName}" executed ${rows.length} time(s) successfully. Latest output: ${JSON.stringify(latestRow.output).slice(0, 500)}`,
            confidence: 1.0, // 1.0 = direct observation (tool ran and succeeded)
            source: `tool:${toolName}`,
            sourceTimestamp: latestRow.startedAt.toISOString(),
            rawIds,
          };

          await db.insert(memoryFacts).values({
            subject: `tool:${toolName}:batch_result`,
            body: factBody,
            isStale: false,
          });

          process.stderr.write(
            `[consolidation] Created fact for tool "${toolName}" (${rows.length} result(s)).\n`
          );
        }
      }
    }

    // 5. Update last consolidation timestamp in agent_state
    //    NEVER deletes rows — isStale pattern only (though not used here)
    const now = new Date();
    const existingTimestamp = await db
      .select()
      .from(agentState)
      .where(eq(agentState.key, 'memory:last_consolidation'))
      .limit(1);

    if (existingTimestamp.length > 0) {
      await db
        .update(agentState)
        .set({ value: { timestamp: now.toISOString() }, updatedAt: now })
        .where(eq(agentState.key, 'memory:last_consolidation'));
    } else {
      await db.insert(agentState).values({
        key: 'memory:last_consolidation',
        value: { timestamp: now.toISOString() },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[consolidation] Error during consolidation: ${message}\n`);
  }
}

/**
 * Start periodic memory consolidation.
 *
 * Runs immediately once at startup (to catch any results from previous runs),
 * then every `intervalMs` milliseconds.
 * Default interval: 5 minutes (300,000ms).
 *
 * @param db - Drizzle DbClient instance
 * @param intervalMs - Consolidation interval in milliseconds (default: 300_000)
 * @returns The setInterval handle — pass to stopConsolidation() or clearInterval() for cleanup
 */
export function startConsolidation(
  db: DbClient,
  intervalMs: number = 300_000
): ReturnType<typeof setInterval> {
  // Run once immediately at startup
  void consolidate(db);

  // Then run on the periodic interval
  const handle = setInterval(() => {
    void consolidate(db);
  }, intervalMs);

  process.stderr.write(`[consolidation] Started. Interval: ${intervalMs}ms.\n`);
  return handle;
}

/**
 * Stop periodic memory consolidation.
 * Wraps clearInterval for explicit named semantics.
 *
 * @param handle - The handle returned by startConsolidation()
 */
export function stopConsolidation(handle: ReturnType<typeof setInterval>): void {
  clearInterval(handle);
  process.stderr.write('[consolidation] Stopped.\n');
}
