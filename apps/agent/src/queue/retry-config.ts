import { UnrecoverableError } from 'bullmq';

/**
 * Retry configuration for BullMQ job options.
 *
 * QUEUE-01: Transient failures retry with exponential backoff up to 5 attempts.
 * Retry schedule: 1s, 2s, 4s, 8s, 16s.
 *
 * QUEUE-02: removeOnFail: false preserves exhausted jobs in BullMQ's failed set
 * (the dead-letter queue / DLQ) for operator inspection and manual replay.
 *
 * QUEUE-03: BullMQ inherently preserves job.data across retries — the job data
 * payload stored in Redis is immutable. Each retry attempt re-reads the same
 * data from the failed job entry, so task payloads are deterministically
 * identical on every attempt. No application code is needed to enforce this.
 */

export interface RetryJobOptions {
  attempts: number;
  backoff: {
    type: 'exponential';
    delay: number;
  };
  removeOnComplete: { age: number };
  removeOnFail: false;
}

/**
 * Returns BullMQ job options with exponential backoff retry and DLQ preservation.
 *
 * @param overrides - Optional overrides for attempts count and initial backoff delay
 * @returns BullMQ job options object ready to spread into queue.add() calls
 */
export function createRetryJobOptions(overrides?: {
  attempts?: number;
  delayMs?: number;
}): RetryJobOptions {
  return {
    attempts: overrides?.attempts ?? 5,
    backoff: {
      type: 'exponential',
      delay: overrides?.delayMs ?? 1000, // 1s, 2s, 4s, 8s, 16s
    },
    removeOnComplete: { age: 3600 }, // Keep successful jobs for 1 hour
    removeOnFail: false,             // QUEUE-02: Preserve in DLQ (failed set) indefinitely
  };
}

/**
 * Determines if an error is transient and should be retried.
 *
 * Transient errors are those caused by temporary external conditions
 * (network blips, rate limits, server overload) that may resolve on retry.
 *
 * Non-transient errors (client errors, validation failures, kill-switch)
 * should NOT be retried — they will fail on every attempt.
 *
 * @param err - The error to classify
 * @returns true if the error is transient and should be retried
 */
export function isTransientError(err: Error): boolean {
  const msg = err.message;
  const name = err.name;

  // NEVER retry kill-switch activation — it is intentional operator control
  if (name === 'KillSwitchActiveError') return false;

  // Never retry validation errors
  if (name === 'ZodError' || name === 'ValidationError') return false;

  // Network-level transient errors
  const networkPatterns = [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'fetch failed',
    'socket hang up',
  ];
  if (networkPatterns.some((pattern) => msg.includes(pattern))) return true;

  // HTTP 429 (rate limit) — transient, retry after backoff
  if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) return true;

  // HTTP 5xx server errors — transient
  if (/\b5[0-9]{2}\b/.test(msg)) return true;

  // Timeout errors — transient
  if (name === 'ToolTimeoutError' || msg.toLowerCase().includes('timeout')) return true;

  // Be conservative: unknown errors should NOT retry infinitely
  // Unknown error patterns are assumed non-transient (permanent failure)
  return false;
}

/**
 * Wraps an async function to enforce transient error classification.
 *
 * If the wrapped function throws a non-transient error, the error is rethrown
 * as an UnrecoverableError. BullMQ treats UnrecoverableError specially —
 * it moves the job directly to the failed set without consuming retry attempts.
 *
 * If the wrapped function throws a transient error, the original error is
 * rethrown unchanged, allowing BullMQ to retry with exponential backoff.
 *
 * Usage:
 *   const result = await wrapWithTransientCheck(() => invokeWithKillCheck(...));
 *
 * @param fn - The async function to wrap
 * @returns The result of fn if it succeeds
 * @throws UnrecoverableError if fn throws a non-transient error
 * @throws Original error if fn throws a transient error (triggers retry)
 */
export async function wrapWithTransientCheck<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && !isTransientError(err)) {
      // Non-transient: skip all remaining retries, move to DLQ immediately
      throw new UnrecoverableError(err.message);
    }
    // Transient: rethrow original error so BullMQ retries with backoff
    throw err;
  }
}
