import type { Queue } from 'bullmq';
import { z } from 'zod';
import type { ToolDefinition } from '@jarvis/tools';

/**
 * MULTI-01: spawn-agent tool — enqueues a sub-agent job on the agent-tasks BullMQ queue.
 *
 * The main agent calls this tool to delegate a scoped task to a sub-agent.
 * Sub-agents run in their own isolated LLM context (fresh message array per job).
 *
 * Locked decision: Sub-agents receive SCOPED context only (MULTI-02).
 * The tool description explicitly instructs the LLM to pass only relevant context.
 */
export function createSpawnAgentTool(queue: Queue): ToolDefinition {
  return {
    name: 'spawn-agent',
    description:
      'Spawn a focused sub-agent to execute a scoped task concurrently. Returns a jobId to track the sub-agent. Use this for tasks that are complex enough to warrant isolated context OR can run in parallel with other work. Do NOT spawn sub-agents for simple, fast tasks — execute those inline.',
    inputSchema: z.object({
      task: z.string().describe('Clear task description with objectives and expected output format'),
      context: z
        .record(z.unknown())
        .describe(
          'Scoped context the sub-agent needs — only what is relevant to the task. Do NOT include parent state or unrelated information.'
        ),
    }),
    timeoutMs: 5_000, // Just the enqueue operation, not the sub-agent runtime
    async execute({ task, context }, _signal) {
      const job = await queue.add(
        'sub-agent',
        { task, context },
        {
          removeOnComplete: { age: 3600 }, // Keep for 1 hour after completion
          removeOnFail: false, // Preserve for DLQ inspection (QUEUE-02)
        }
      );
      return { jobId: job.id };
    },
  };
}

/**
 * MULTI-03: await-agent tool — polls for a sub-agent job to complete and returns its result.
 *
 * The main agent calls this tool after spawn-agent to get the structured result
 * from job.returnvalue once the sub-agent finishes.
 *
 * Polls every 2 seconds. Timeout: 5 minutes max.
 */
export function createAwaitAgentTool(queue: Queue): ToolDefinition {
  return {
    name: 'await-agent',
    description:
      'Wait for a spawned sub-agent to complete and return its structured result. Polls every 2 seconds.',
    inputSchema: z.object({
      jobId: z.string().describe('The jobId returned by spawn-agent'),
    }),
    timeoutMs: 300_000, // 5 min max wait
    async execute({ jobId }, signal) {
      while (!signal.aborted) {
        const job = await queue.getJob(jobId);
        if (!job) throw new Error('Sub-agent job not found: ' + jobId);

        const state = await job.getState();
        if (state === 'completed') return job.returnvalue;
        if (state === 'failed')
          throw new Error('Sub-agent failed: ' + (job.failedReason ?? 'unknown'));

        // Poll every 2 seconds
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error('await-agent aborted by timeout');
    },
  };
}

/**
 * MULTI-04: cancel-agent tool — cancels a running sub-agent by moving its job to failed state.
 *
 * Uses job.moveToFailed() rather than worker.cancelJob() since we may not have
 * a reference to the worker from the tool context.
 */
export function createCancelAgentTool(queue: Queue): ToolDefinition {
  return {
    name: 'cancel-agent',
    description:
      'Cancel a running sub-agent. Use when a sub-agent is stuck or its task is no longer needed.',
    inputSchema: z.object({
      jobId: z.string().describe('The jobId of the sub-agent to cancel'),
    }),
    timeoutMs: 10_000,
    async execute({ jobId }, _signal) {
      const job = await queue.getJob(jobId);
      if (!job) return { cancelled: false, reason: 'job not found' };

      const state = await job.getState();
      if (state === 'completed' || state === 'failed') {
        return { cancelled: false, reason: 'already ' + state };
      }

      // Move to failed state — parent agent can detect via await-agent's 'failed' check
      await job.moveToFailed(new Error('Cancelled by parent agent'), 'cancel-agent', true);
      return { cancelled: true };
    },
  };
}
