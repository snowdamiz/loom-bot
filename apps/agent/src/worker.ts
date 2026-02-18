import 'dotenv/config';
import { Worker } from 'bullmq';
import { db } from '@jarvis/db';
import { createDefaultRegistry, invokeWithLogging } from '@jarvis/tools';

/**
 * BullMQ worker entry point for long-running tool execution.
 *
 * Listens on the 'tool-execution' queue and processes tool invocation jobs
 * by delegating to invokeWithLogging() — the single invocation entry point.
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

const worker = new Worker(
  'tool-execution',
  async (job) => {
    const { toolName, input, timeoutMs } = job.data as {
      toolName: string;
      input: unknown;
      timeoutMs?: number;
    };

    const result = await invokeWithLogging(registry, db, toolName, input, timeoutMs);
    return result;
  },
  {
    connection: {
      url: process.env.REDIS_URL!,
    },
    concurrency: 5,
    // Don't let completed/failed jobs accumulate in Redis indefinitely
    removeOnComplete: { age: 3600 },   // Keep successful jobs for 1 hour
    removeOnFail: { age: 86400 },      // Keep failed jobs for 24 hours
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
