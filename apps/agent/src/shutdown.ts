import type { Worker } from 'bullmq';

/**
 * Graceful shutdown handler for all service connections.
 *
 * Listens for SIGTERM and SIGINT signals and shuts down:
 * 1. Memory consolidation interval (if provided)
 * 2. Supervisor: stop all active main agent loops (Phase 3)
 * 3. Agent worker: close BullMQ worker for sub-agent jobs (Phase 3)
 * 4. Agent-tasks queue: close BullMQ queue for sub-agent dispatch (Phase 3)
 * 5. BullMQ worker (if provided)
 * 6. Redis client
 * 7. Postgres connection pool
 *
 * Per research anti-pattern guidance: ALWAYS call pool.end() to prevent connection leaks.
 * A 10-second force-kill timeout ensures the process exits even if graceful shutdown hangs.
 *
 * Types for pool and redis are kept as interface contracts to avoid importing ioredis/pg
 * directly in apps/agent (pnpm strict isolation — those are deps of @jarvis/db and @jarvis/tools).
 */
export interface ShutdownPool {
  end(): Promise<void>;
}

export interface ShutdownRedis {
  quit(): Promise<string>;
}

/**
 * Minimal interface for Supervisor shutdown — avoids importing the concrete Supervisor class
 * directly, keeping shutdown.ts decoupled from the supervisor implementation.
 */
export interface ShutdownSupervisor {
  stopMainAgent(goalId: number): Promise<void>;
  getActiveGoalIds(): number[];
}

export interface ShutdownResources {
  pool: ShutdownPool;
  redis: ShutdownRedis;
  worker?: Worker;
  consolidation?: ReturnType<typeof setInterval>;
  /** Phase 3: Supervisor managing main agent loops */
  supervisor?: ShutdownSupervisor;
  /** Phase 3: BullMQ worker processing sub-agent jobs */
  agentWorker?: Worker;
  /** Phase 3: BullMQ queue for sub-agent job dispatch */
  agentTasksQueue?: { close(): Promise<void> };
}

export function registerShutdownHandlers(resources: ShutdownResources): void {
  const { pool, redis, worker, consolidation, supervisor, agentWorker, agentTasksQueue } = resources;

  async function gracefulShutdown(signal: string): Promise<void> {
    process.stderr.write(`[shutdown] Received ${signal}. Shutting down...\n`);

    // Force-kill timeout: if graceful shutdown takes more than 10 seconds, force exit
    const forceKillTimer = setTimeout(() => {
      process.stderr.write('[shutdown] Graceful shutdown timed out after 10s. Forcing exit.\n');
      process.exit(1);
    }, 10_000);

    // Don't let the timer keep the process alive
    forceKillTimer.unref();

    try {
      // 1. Stop memory consolidation interval first (prevents new DB writes)
      if (consolidation !== undefined) {
        clearInterval(consolidation);
        process.stderr.write('[shutdown] Memory consolidation stopped.\n');
      }

      // 2. Stop all active main agent loops via supervisor
      if (supervisor !== undefined) {
        const activeGoalIds = supervisor.getActiveGoalIds();
        for (const goalId of activeGoalIds) {
          await supervisor.stopMainAgent(goalId);
        }
        process.stderr.write(`[shutdown] Stopped ${activeGoalIds.length} main agent loops.\n`);
      }

      // 3. Close sub-agent worker (stop accepting new jobs, drain in-flight)
      if (agentWorker !== undefined) {
        await agentWorker.close();
        process.stderr.write('[shutdown] Sub-agent worker closed.\n');
      }

      // 4. Close agent-tasks queue
      if (agentTasksQueue !== undefined) {
        await agentTasksQueue.close();
        process.stderr.write('[shutdown] Agent-tasks queue closed.\n');
      }

      // 5. Close BullMQ worker (stop accepting new jobs, drain in-flight)
      if (worker !== undefined) {
        await worker.close();
        process.stderr.write('[shutdown] BullMQ worker closed.\n');
      }

      // 6. Quit Redis (sends QUIT command, waits for acknowledgment)
      await redis.quit();
      process.stderr.write('[shutdown] Redis disconnected.\n');

      // 7. End Postgres pool (drains in-flight queries, prevents connection leaks)
      await pool.end();
      process.stderr.write('[shutdown] Postgres pool closed.\n');

      clearTimeout(forceKillTimer);
      process.stderr.write('[shutdown] Graceful shutdown complete.\n');
      process.exit(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[shutdown] Error during graceful shutdown: ${message}\n`);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
}
