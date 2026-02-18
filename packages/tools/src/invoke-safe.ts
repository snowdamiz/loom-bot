import type { DbClient } from '@jarvis/db';
import type { ToolRegistry } from './registry.js';
import type { ToolResult } from './types.js';
import { invokeWithLogging } from './invoke.js';

/**
 * TOOL-06: Kill switch gate for tool invocations.
 *
 * Duck-typed interface — only requires assertActive() so that tools package
 * does not need to import @jarvis/ai directly (avoids any potential dep cycles
 * and keeps the interface minimal).
 */
interface KillCheckable {
  assertActive(): Promise<void>;
}

/**
 * invokeWithKillCheck — wraps invokeWithLogging with a kill switch pre-check.
 *
 * TOOL-06: Every tool call is checked against the kill switch before execution.
 * If the kill switch is active, throws KillSwitchActiveError before any tool runs.
 *
 * Kill switch enforcement path:
 *   CLI -> DB flag -> KillSwitchGuard cache -> assertActive() throw -> blocks tool calls
 *
 * @param guard            - KillSwitchGuard (or any object with assertActive())
 * @param registry         - ToolRegistry to look up the tool
 * @param db               - Drizzle DbClient for logging
 * @param toolName         - Name of the tool to invoke
 * @param rawInput         - Unvalidated input (validated by invokeWithLogging via zod)
 * @param overrideTimeoutMs - Override the tool's default timeout for this invocation
 * @returns ToolResult — or throws KillSwitchActiveError if kill switch is active
 */
export async function invokeWithKillCheck(
  guard: KillCheckable,
  registry: ToolRegistry,
  db: DbClient,
  toolName: string,
  rawInput: unknown,
  overrideTimeoutMs?: number
): Promise<ToolResult<unknown>> {
  // assertActive() throws KillSwitchActiveError if kill switch is active
  await guard.assertActive();

  return invokeWithLogging(registry, db, toolName, rawInput, overrideTimeoutMs);
}
