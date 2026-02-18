import type { DbClient } from '@jarvis/db';
import { toolCalls } from '@jarvis/db';

/**
 * LOG-02, LOG-05, TOOL-05: Tool call logging with strict two-row append-only pattern.
 *
 * The API design enforces pre-execution logging (TOOL-05):
 * - Caller MUST call logToolStart BEFORE executing the tool to obtain the parentId.
 * - Caller MUST pass that parentId to logToolComplete or logToolFailure after execution.
 * - The original started row is NEVER modified — all completions create NEW rows.
 */

/**
 * Insert a "started" row for a tool call BEFORE the tool executes.
 * Returns the inserted row id, which must be passed to logToolComplete or logToolFailure.
 *
 * TOOL-05: This function MUST be called before tool execution.
 */
export async function logToolStart(
  db: DbClient,
  params: { toolName: string; input: unknown }
): Promise<number> {
  const rows = await db
    .insert(toolCalls)
    .values({
      toolName: params.toolName,
      status: 'started',
      input: params.input as Record<string, unknown>,
      startedAt: new Date(),
    })
    .returning({ id: toolCalls.id });

  const row = rows[0];
  if (!row) {
    throw new Error('logToolStart: insert returned no rows');
  }
  return row.id;
}

/**
 * Insert a "success" completion row AFTER the tool executes successfully.
 * Creates a NEW row (LOG-05 append-only) — NEVER updates the original started row.
 *
 * @param parentId - The id returned by logToolStart
 */
export async function logToolComplete(
  db: DbClient,
  params: { parentId: number; output: unknown; durationMs: number }
): Promise<number> {
  const rows = await db
    .insert(toolCalls)
    .values({
      parentId: params.parentId,
      toolName: 'completion',
      status: 'success',
      input: {} as Record<string, unknown>,
      output: params.output as Record<string, unknown>,
      durationMs: params.durationMs,
      startedAt: new Date(),
      completedAt: new Date(),
    })
    .returning({ id: toolCalls.id });

  const row = rows[0];
  if (!row) {
    throw new Error('logToolComplete: insert returned no rows');
  }
  return row.id;
}

/**
 * Insert a "failure" completion row AFTER the tool throws or errors.
 * Creates a NEW row (LOG-05 append-only) — NEVER updates the original started row.
 *
 * @param parentId - The id returned by logToolStart
 */
export async function logToolFailure(
  db: DbClient,
  params: { parentId: number; error: string; durationMs: number }
): Promise<number> {
  const rows = await db
    .insert(toolCalls)
    .values({
      parentId: params.parentId,
      toolName: 'failure',
      status: 'failure',
      input: {} as Record<string, unknown>,
      error: params.error,
      durationMs: params.durationMs,
      startedAt: new Date(),
      completedAt: new Date(),
    })
    .returning({ id: toolCalls.id });

  const row = rows[0];
  if (!row) {
    throw new Error('logToolFailure: insert returned no rows');
  }
  return row.id;
}
