/**
 * TOOL-07: AbortController-based timeout wrapper.
 *
 * Enforces configurable time limits on all tool invocations.
 * Uses the standard Node.js AbortController/AbortSignal pattern for cancellation,
 * allowing tool implementations to clean up resources (kill processes, abort requests, etc.)
 * when the timeout fires.
 */

/**
 * ToolTimeoutError — thrown by withTimeout when a tool exceeds its time limit.
 *
 * Carries the timeout value for debugging and error reporting.
 * Error message includes tool name and timeout value to aid diagnosis.
 */
export class ToolTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(toolName: string, timeoutMs: number) {
    super(
      `Tool "${toolName}" timed out after ${timeoutMs}ms. ` +
        `Increase timeoutMs or optimize the tool implementation.`
    );
    this.name = 'ToolTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * withTimeout<T> — wraps an async function with an AbortController-based timeout.
 *
 * Creates an AbortController, schedules abort after timeoutMs, then invokes fn(signal).
 * If the timeout fires before fn resolves, throws ToolTimeoutError.
 * Always clears the timer in finally to prevent timer leaks.
 *
 * @param toolName  - Tool name for the error message (debugging aid)
 * @param fn        - Async function to execute; receives AbortSignal for cooperative cancellation
 * @param timeoutMs - Maximum duration in milliseconds
 * @returns The result of fn
 * @throws ToolTimeoutError if timeout fires before fn resolves
 */
export async function withTimeout<T>(
  toolName: string,
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ToolTimeoutError(toolName, timeoutMs));
      }, timeoutMs);
    });

    return await Promise.race([fn(controller.signal), timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
