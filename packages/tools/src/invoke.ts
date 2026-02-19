import type { DbClient } from '@jarvis/db';
import { logToolStart, logToolComplete, logToolFailure } from '@jarvis/logging';
import type { ToolRegistry } from './registry.js';
import type { ToolResult } from './types.js';
import type { SelfExtensionExecutionContext } from './self-extension/pipeline-context.js';
import { withTimeout, ToolTimeoutError } from './timeout.js';

/**
 * invokeWithLogging — the single entry point for all tool execution.
 *
 * Guarantees:
 * - TOOL-05: Pre-execution logging (logToolStart is called BEFORE execute())
 * - LOG-02: Full, untruncated output is always logged to Postgres
 * - Caller receives a ToolResult (never throws) with optional truncation for LLM context protection
 *
 * Truncation design (critical distinction):
 * - The log row in tool_calls.output ALWAYS contains the full, untruncated raw output.
 *   ("Log everything: complete shell output. Storage is cheap, missing data is not recoverable.")
 * - The ToolResult returned to the caller may have output truncated if maxOutputBytes is set
 *   and the serialized output exceeds that limit. This protects the LLM context window.
 * - These are two distinct outputs. They MUST be handled separately.
 *
 * @param registry         - ToolRegistry to look up the tool
 * @param db               - Drizzle DbClient for logging
 * @param toolName         - Name of the tool to invoke
 * @param rawInput         - Unvalidated input (validated via tool.inputSchema.parse)
 * @param overrideTimeoutMs - Override the tool's default timeout for this invocation
 * @param executionContext - Optional internal metadata for self-extension traceability.
 *   This is not exposed to the tool's zod input schema or LLM-facing tool arguments.
 * @returns ToolResult — never throws; failures are returned as { success: false, error }
 */
export async function invokeWithLogging(
  registry: ToolRegistry,
  db: DbClient,
  toolName: string,
  rawInput: unknown,
  overrideTimeoutMs?: number,
  executionContext?: SelfExtensionExecutionContext,
): Promise<ToolResult<unknown>> {
  const startTime = Date.now();

  // 1. Look up tool — return failure if not found (never throw)
  const tool = registry.get(toolName);
  if (!tool) {
    const durationMs = Date.now() - startTime;
    return {
      success: false,
      error: `Tool "${toolName}" is not registered. Available tools: ${registry.list().map((t) => t.name).join(', ')}`,
      durationMs,
    };
  }

  // 2. Validate input via zod schema — return failure if invalid (never throw)
  let validatedInput: unknown;
  try {
    validatedInput = tool.inputSchema.parse(rawInput);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Input validation failed for tool "${toolName}": ${message}`,
      durationMs,
    };
  }

  // 3. TOOL-05: Log BEFORE execution to obtain parentId
  //    This log entry is immutable (LOG-05 append-only) — the started row is never modified.
  let parentId: number;
  try {
    parentId = await logToolStart(db, { toolName, input: validatedInput });
  } catch (err) {
    // Logging failure is non-fatal but we must still execute the tool.
    // Use a sentinel parentId of -1 to indicate no log row exists.
    // This is an edge case — Postgres should always be available.
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[invokeWithLogging] logToolStart failed: ${message}\n`);
    parentId = -1;
  }

  const execStart = Date.now();

  // 4. Execute tool with timeout
  let rawOutput: unknown;
  try {
    const timeoutMs = overrideTimeoutMs ?? tool.timeoutMs;
    rawOutput = await withTimeout(
      tool.name,
      (signal) => tool.execute(validatedInput as never, signal, executionContext),
      timeoutMs,
    );
  } catch (err) {
    // 5a. Failure path: log the error (full message), return failure ToolResult
    const durationMs = Date.now() - execStart;
    const totalDuration = Date.now() - startTime;

    let errorMessage: string;
    if (err instanceof ToolTimeoutError) {
      errorMessage = `Tool "${toolName}" timed out after ${err.timeoutMs}ms`;
    } else if (err instanceof Error) {
      errorMessage = err.message;
    } else {
      errorMessage = String(err);
    }

    if (parentId !== -1) {
      try {
        await logToolFailure(db, { parentId, error: errorMessage, durationMs });
      } catch (logErr) {
        const msg = logErr instanceof Error ? logErr.message : String(logErr);
        process.stderr.write(`[invokeWithLogging] logToolFailure failed: ${msg}\n`);
      }
    }

    return {
      success: false,
      error: errorMessage,
      durationMs: totalDuration,
    };
  }

  // 5b. Success path
  const durationMs = Date.now() - execStart;
  const totalDuration = Date.now() - startTime;

  // LOG-02: Log the FULL, untruncated output to Postgres — always.
  if (parentId !== -1) {
    try {
      await logToolComplete(db, { parentId, output: rawOutput, durationMs });
    } catch (logErr) {
      const msg = logErr instanceof Error ? logErr.message : String(logErr);
      process.stderr.write(`[invokeWithLogging] logToolComplete failed: ${msg}\n`);
    }
  }

  // 6. Apply output size truncation AFTER logging — only for the ToolResult returned to caller.
  //    This protects LLM context from huge payloads.
  //    The log row always contains the complete, untruncated data.
  if (tool.maxOutputBytes !== undefined) {
    const serialized = JSON.stringify(rawOutput);
    if (serialized.length > tool.maxOutputBytes) {
      // Truncate the serialized output and return as a string to signal truncation.
      const truncatedStr = serialized.slice(0, tool.maxOutputBytes);
      return {
        success: true,
        output: truncatedStr,
        durationMs: totalDuration,
        truncated: true,
      };
    }
  }

  return {
    success: true,
    output: rawOutput,
    durationMs: totalDuration,
  };
}
