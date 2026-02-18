import type { Queue } from 'bullmq';

/**
 * MULTI-03: ResultCollector — aggregates results from multiple sub-agent BullMQ jobs.
 *
 * The parent agent uses this to wait for and collect structured results from
 * sub-agents it spawned via the spawn-agent tool.
 *
 * Design (locked decision): Parent agent periodically checks in on sub-agents
 * via getJobStatus(). collectResults() handles batched collection with timeout.
 */
export class ResultCollector {
  constructor(private readonly queue: Queue) {}

  /**
   * Collect results from multiple sub-agent jobs in parallel.
   *
   * Polls all jobIds concurrently until all complete or timeout is reached.
   * Results are returned in the same order as the input jobIds array.
   *
   * @param jobIds    - BullMQ job IDs returned by spawn-agent tool calls
   * @param timeoutMs - Maximum time to wait for all jobs (default: 300_000 = 5 min)
   * @returns Array of results in jobIds order; each entry has success flag + result or error
   */
  async collectResults(
    jobIds: string[],
    timeoutMs = 300_000,
  ): Promise<Array<{ jobId: string; success: boolean; result?: unknown; error?: string }>> {
    const deadline = Date.now() + timeoutMs;

    // Track which jobs are still pending
    const pending = new Set(jobIds);
    const results = new Map<string, { jobId: string; success: boolean; result?: unknown; error?: string }>();

    while (pending.size > 0 && Date.now() < deadline) {
      // Poll all pending jobs in parallel
      const checks = await Promise.all(
        Array.from(pending).map(async (jobId) => {
          const status = await this.getJobStatus(jobId);
          return { jobId, status };
        }),
      );

      for (const { jobId, status } of checks) {
        if (status.state === 'completed') {
          results.set(jobId, {
            jobId,
            success: true,
            result: status.result,
          });
          pending.delete(jobId);
        } else if (status.state === 'failed') {
          results.set(jobId, {
            jobId,
            success: false,
            error: status.error ?? 'unknown error',
          });
          pending.delete(jobId);
        }
        // Still active states: 'waiting', 'active', 'delayed', 'waiting-children'
        // These stay in pending — polled again on next iteration
      }

      if (pending.size > 0) {
        // Sleep briefly before next poll round to avoid hammering Redis
        await sleep(2_000);
      }
    }

    // For any jobs still pending after timeout, mark as timed out
    for (const jobId of pending) {
      results.set(jobId, {
        jobId,
        success: false,
        error: `timeout after ${timeoutMs}ms`,
      });
    }

    // Return results in original jobIds order
    return jobIds.map((jobId) => results.get(jobId) ?? {
      jobId,
      success: false,
      error: 'result not collected',
    });
  }

  /**
   * Get the current status of a single sub-agent job.
   *
   * Used by parent agents to check in on sub-agent progress periodically
   * without waiting for full completion (locked decision — parent checks in periodically).
   *
   * @param jobId - The BullMQ job ID to check
   * @returns Current state + available data (result or error)
   */
  async getJobStatus(jobId: string): Promise<{
    state: string;
    progress?: number;
    result?: unknown;
    error?: string;
  }> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return { state: 'not-found', error: `Job ${jobId} not found in queue` };
    }

    const state = await job.getState();

    // Extract progress if available
    const progress = typeof job.progress === 'number' ? job.progress : undefined;

    if (state === 'completed') {
      return {
        state,
        progress: 100,
        result: job.returnvalue,
      };
    }

    if (state === 'failed') {
      return {
        state,
        error: job.failedReason ?? 'unknown error',
      };
    }

    return {
      state,
      progress,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
