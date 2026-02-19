import { z } from 'zod';
import type { SelfExtensionExecutionContext } from './self-extension/pipeline-context.js';

/**
 * ToolDefinition<TInput, TOutput> — the contract every tool must implement.
 *
 * @template TInput  - The validated input type (inferred from inputSchema)
 * @template TOutput - The raw output type returned by execute()
 *
 * Note on maxOutputBytes:
 *   This cap applies ONLY to the ToolResult returned to the caller (protecting LLM context).
 *   The complete, untruncated output is ALWAYS logged to Postgres (LOG-02, locked decision).
 *   "Log everything: complete shell output. Storage is cheap, missing data is not recoverable."
 *
 * Note on AbortSignal:
 *   execute() receives the signal so implementations can check for abort and clean up
 *   resources (e.g., kill a child process, abort a fetch). This is the standard Node.js
 *   pattern for cooperative cancellation.
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  // ZodType<TOutput, Def, TInput> — the third param (TInput to the schema) is unknown
  // because we always receive raw (unvalidated) input. This allows ZodDefault fields
  // whose _input type is T|undefined to be assigned to ZodType<T, ZodTypeDef, unknown>.
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  /** Default timeout in milliseconds; overridable per invocation via invokeWithLogging */
  timeoutMs: number;
  /**
   * Output size cap in bytes for the ToolResult returned to the caller.
   * Protects LLM context from huge payloads (e.g., 10MB shell output).
   * Full output is ALWAYS logged to Postgres regardless of this limit.
   */
  maxOutputBytes?: number;
  execute(
    input: TInput,
    signal: AbortSignal,
    executionContext?: SelfExtensionExecutionContext,
  ): Promise<TOutput>;
}

/**
 * ToolResult<T> — the structured result returned to the caller after tool invocation.
 *
 * Note on truncated:
 *   When true, output was truncated because JSON.stringify(rawOutput).length > maxOutputBytes.
 *   The complete output is still available in the tool_calls table in Postgres.
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  output?: T;
  error?: string;
  durationMs: number;
  /** true if output was truncated due to maxOutputBytes limit. Full output is in Postgres. */
  truncated?: boolean;
}
