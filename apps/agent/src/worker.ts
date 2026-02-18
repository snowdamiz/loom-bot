import 'dotenv/config';
import { Worker, UnrecoverableError } from 'bullmq';
import { db } from '@jarvis/db';
import { createDefaultRegistry, invokeWithKillCheck } from '@jarvis/tools';
import { KillSwitchGuard } from '@jarvis/ai';
import { isTransientError } from './queue/retry-config.js';

/**
 * BullMQ worker entry point for long-running tool execution.
 *
 * Listens on the 'tool-execution' queue and processes tool invocation jobs
 * by delegating to invokeWithKillCheck() — the kill-switch-gated invocation entry point.
 *
 * TOOL-06: Every tool execution job checks the kill switch before running.
 * If the kill switch is active, the job throws KillSwitchActiveError without executing.
 *
 * QUEUE-01: Transient failures (network errors, rate limits, 5xx) retry with
 * exponential backoff up to 5 attempts (1s, 2s, 4s, 8s, 16s).
 * The attempts/backoff options are set per-job via createRetryJobOptions() when
 * jobs are enqueued (BullMQ Worker does not support defaultJobOptions).
 *
 * QUEUE-02: removeOnFail: false preserves exhausted jobs in BullMQ's failed set
 * (DLQ) for operator inspection. Failed jobs are kept indefinitely.
 *
 * QUEUE-03: BullMQ preserves job.data across retries — the data payload in Redis
 * is immutable. Each retry reads identical data, ensuring deterministic replay.
 *
 * Concurrency: 5 (process up to 5 jobs in parallel).
 *
 * Job data format:
 * {
 *   toolName: string,    // Name of the tool to invoke
 *   input: unknown,      // Raw input (validated by invokeWithLogging via zod)
 *   timeoutMs?: number,  // Optional per-job timeout override
 * }
 */

const registry = createDefaultRegistry(db);
const killSwitch = new KillSwitchGuard(db);

const worker = new Worker(
  'tool-execution',
  async (job) => {
    const { toolName, input, timeoutMs } = job.data as {
      toolName: string;
      input: unknown;
      timeoutMs?: number;
    };

    try {
      const result = await invokeWithKillCheck(killSwitch, registry, db, toolName, input, timeoutMs);
      return result;
    } catch (err) {
      if (err instanceof Error && !isTransientError(err)) {
        // Non-transient failure: skip remaining retries, move to DLQ immediately.
        // UnrecoverableError tells BullMQ to not consume retry attempts.
        throw new UnrecoverableError(err.message);
      }
      // Transient failure: rethrow so BullMQ retries with exponential backoff.
      throw err;
    }
  },
  {
    connection: {
      url: process.env.REDIS_URL!,
    },
    concurrency: 5,
    // Keep successful jobs for 1 hour
    removeOnComplete: { age: 3600 },
    // QUEUE-02: Do NOT set removeOnFail here — BullMQ's default is to keep all failed
    // jobs in the failed set (DLQ) indefinitely. Jobs enqueued via enqueueAsyncTask()
    // also set removeOnFail: false explicitly via createRetryJobOptions().
  }
);

worker.on('completed', (job) => {
  process.stderr.write(`[worker] Job ${job.id} (${(job.data as { toolName?: string }).toolName}) completed.\n`);
});

worker.on('failed', (job, err) => {
  const jobId = job?.id ?? 'unknown';
  const toolName = (job?.data as { toolName?: string } | undefined)?.toolName ?? 'unknown';
  process.stderr.write(`[worker] Job ${jobId} (${toolName}) failed: ${err.message}\n`);
});

worker.on('error', (err) => {
  process.stderr.write(`[worker] Worker error: ${err.message}\n`);
});

process.stderr.write('[worker] Worker started, listening for tool-execution jobs\n');
