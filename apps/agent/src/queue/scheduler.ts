import { Queue } from 'bullmq';
import { createRetryJobOptions } from './retry-config.js';

/**
 * Scheduler helpers for cron-based and fixed-interval recurring tasks.
 *
 * QUEUE-04: Recurring tasks are registered via BullMQ's upsertJobScheduler(),
 * which persists the schedule in Redis. The schedule survives process restarts
 * because it is stored in Redis, not in process memory. When the worker restarts,
 * BullMQ automatically resumes firing jobs on the registered schedule.
 *
 * QUEUE-05 (async execution): Long-running tasks (browser automation, web research)
 * are already asynchronous by design. They are enqueued as regular BullMQ jobs on
 * the tool-execution queue and processed by the worker. The agent loop does NOT block
 * waiting for completion — it enqueues and moves on. The job result is available via
 * job.getState() / queue events when it completes. This architectural decision means
 * the planning loop never stalls on slow external operations.
 */

/**
 * Shared job data shape for tool execution jobs.
 */
export interface ToolJobData {
  toolName: string;
  input: unknown;
  timeoutMs?: number;
}

/**
 * Schedules a recurring task using a cron pattern.
 *
 * The schedulerId is idempotent — calling with the same ID updates the schedule
 * rather than creating a duplicate. This makes it safe to call on every startup.
 *
 * Examples:
 *   scheduleRecurringTask(queue, 'daily-market-scan', '0 6 * * *', { toolName: 'http', input: { url: '...' } })
 *   scheduleRecurringTask(queue, 'hourly-health-check', '0 * * * *', { toolName: 'db', input: { query: 'SELECT 1' } })
 *
 * @param queue - BullMQ Queue instance
 * @param schedulerId - Stable identifier for this schedule (used for idempotent upsert)
 * @param cronPattern - Standard cron expression (e.g., '0 6 * * *' for 6am daily)
 * @param jobData - Tool name, input, and optional timeout for each fired job
 */
export async function scheduleRecurringTask(
  queue: Queue,
  schedulerId: string,
  cronPattern: string,
  jobData: ToolJobData
): Promise<void> {
  await queue.upsertJobScheduler(
    schedulerId,
    { pattern: cronPattern },
    { name: 'tool-execution', data: jobData }
  );
}

/**
 * Schedules a recurring task using a fixed time interval.
 *
 * Useful for sub-minute intervals like health checks or polling.
 *
 * @param queue - BullMQ Queue instance
 * @param schedulerId - Stable identifier for this schedule (idempotent upsert)
 * @param everyMs - Interval in milliseconds between executions
 * @param jobData - Tool name, input, and optional timeout for each fired job
 */
export async function scheduleFixedInterval(
  queue: Queue,
  schedulerId: string,
  everyMs: number,
  jobData: ToolJobData
): Promise<void> {
  await queue.upsertJobScheduler(
    schedulerId,
    { every: everyMs },
    { name: 'tool-execution', data: jobData }
  );
}

/**
 * Cancels a recurring schedule by its scheduler ID.
 *
 * After removal, no more jobs will be fired for this schedule.
 * In-flight jobs (already enqueued) are not affected.
 *
 * @param queue - BullMQ Queue instance
 * @param schedulerId - The scheduler ID to cancel
 */
export async function removeSchedule(queue: Queue, schedulerId: string): Promise<void> {
  await queue.removeJobScheduler(schedulerId);
}

/**
 * Lists all active job schedules on the queue.
 *
 * Returns simplified schedule info for operator visibility. Useful for
 * inspecting what recurring tasks are registered without querying Redis directly.
 *
 * @param queue - BullMQ Queue instance
 * @returns Array of active schedule descriptors
 */
export async function listSchedules(
  queue: Queue
): Promise<Array<{ id: string; pattern?: string; every?: number; next?: number }>> {
  const schedulers = await queue.getJobSchedulers();
  return schedulers
    .filter((s): s is typeof s & { id: string } => typeof s.id === 'string')
    .map((s) => ({
      id: s.id,
      pattern: s.pattern,
      every: typeof s.every === 'string' ? parseInt(s.every, 10) : s.every,
      next: s.next,
    }));
}

/**
 * Enqueues a one-off async tool execution job with retry options.
 *
 * QUEUE-05: Long-running tools (browser automation, web research) are dispatched
 * here. The caller receives a jobId and can poll for completion asynchronously.
 * The agent planning loop is never blocked waiting for the result.
 *
 * @param queue - BullMQ Queue instance
 * @param jobData - Tool name, input, and optional timeout
 * @param options - Optional priority (0 = highest)
 * @returns The jobId assigned by BullMQ
 */
export async function enqueueAsyncTask(
  queue: Queue,
  jobData: ToolJobData,
  options?: { priority?: number }
): Promise<string> {
  const job = await queue.add('tool-execution', jobData, {
    ...createRetryJobOptions(),
    priority: options?.priority,
  });
  return job.id!;
}
