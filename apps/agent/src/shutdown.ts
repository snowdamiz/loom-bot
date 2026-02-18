import type { Worker } from 'bullmq';

/**
 * Graceful shutdown handler for all service connections.
 *
 * Listens for SIGTERM and SIGINT signals and shuts down:
 * 1. Memory consolidation interval (if provided)
 * 2. BullMQ worker (if provided)
 * 3. Redis client
 * 4. Postgres connection pool
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

export interface ShutdownResources {
  pool: ShutdownPool;
  redis: ShutdownRedis;
  worker?: Worker;
  consolidation?: ReturnType<typeof setInterval>;
}

export function registerShutdownHandlers(resources: ShutdownResources): void {
  const { pool, redis, worker, consolidation } = resources;

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

      // 2. Close BullMQ worker (stop accepting new jobs, drain in-flight)
      if (worker !== undefined) {
        await worker.close();
        process.stderr.write('[shutdown] BullMQ worker closed.\n');
      }

      // 3. Quit Redis (sends QUIT command, waits for acknowledgment)
      await redis.quit();
      process.stderr.write('[shutdown] Redis disconnected.\n');

      // 4. End Postgres pool (drains in-flight queries, prevents connection leaks)
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
