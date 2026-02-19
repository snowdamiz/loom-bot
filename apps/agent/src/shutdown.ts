import type { Worker } from 'bullmq';

/**
 * Graceful shutdown handler for all service connections.
 *
 * Listens for SIGTERM and SIGINT signals and shuts down in order:
 * 1.   Memory consolidation interval (prevents new DB writes)
 * 2.   Wallet subscription (stops inbound monitoring)
 * 2.5. Browser close (kills Chromium child process — prevents zombie, Phase 6)
 * 3.   Supervisor: stop all active main agent loops (Phase 3)
 * 4.   Agent worker: close BullMQ worker for sub-agent jobs (Phase 3)
 * 5.   Agent-tasks queue: close BullMQ queue for sub-agent dispatch (Phase 3)
 * 6.   BullMQ worker (if provided)
 * 7.   Signer process: kill SIGTERM to signer co-process (Phase 4)
 * 8.   Redis client
 * 9.   Postgres connection pool
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

/**
 * Duck-typed interface for the signer child process.
 * Avoids importing child_process types directly (pnpm strict isolation).
 * Only needs kill() and pid for shutdown purposes.
 *
 * kill() accepts number | NodeJS.Signals | string to match ChildProcess.kill() signature.
 */
export interface ShutdownSignerProcess {
  kill(signal?: number | NodeJS.Signals | string): boolean;
  pid?: number;
}

/**
 * Minimal interface for BrowserManager shutdown — avoids importing the concrete
 * BrowserManager class in shutdown.ts, keeping it decoupled per pnpm strict isolation.
 * Matches the BrowserManager API from @jarvis/browser.
 */
export interface ShutdownBrowserManager {
  close(): Promise<void>;
  isRunning(): boolean;
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
  /** Phase 4: Signer co-process (child_process.fork) */
  signerProcess?: ShutdownSignerProcess;
  /** Phase 4: Wallet WebSocket subscription */
  walletSubscription?: { stop: () => void };
  /** Phase 6: Browser manager (Chromium child process — must close to prevent zombie) */
  browserManager?: ShutdownBrowserManager;
}

export function registerShutdownHandlers(resources: ShutdownResources): void {
  const {
    pool,
    redis,
    worker,
    consolidation,
    supervisor,
    agentWorker,
    agentTasksQueue,
    signerProcess,
    walletSubscription,
    browserManager,
  } = resources;

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

      // 2. Stop wallet subscription (inbound monitoring) before stopping supervisor
      if (walletSubscription !== undefined) {
        walletSubscription.stop();
        process.stderr.write('[shutdown] Wallet subscription stopped.\n');
      }

      // 2.5. Close browser (kills Chromium child process — prevents zombie per research Pitfall 6)
      if (browserManager !== undefined && browserManager.isRunning()) {
        await browserManager.close();
        process.stderr.write('[shutdown] Browser closed.\n');
      }

      // 3. Stop all active main agent loops via supervisor
      if (supervisor !== undefined) {
        const activeGoalIds = supervisor.getActiveGoalIds();
        for (const goalId of activeGoalIds) {
          await supervisor.stopMainAgent(goalId);
        }
        process.stderr.write(`[shutdown] Stopped ${activeGoalIds.length} main agent loops.\n`);
      }

      // 4. Close sub-agent worker (stop accepting new jobs, drain in-flight)
      if (agentWorker !== undefined) {
        await agentWorker.close();
        process.stderr.write('[shutdown] Sub-agent worker closed.\n');
      }

      // 5. Close agent-tasks queue
      if (agentTasksQueue !== undefined) {
        await agentTasksQueue.close();
        process.stderr.write('[shutdown] Agent-tasks queue closed.\n');
      }

      // 6. Close BullMQ worker (stop accepting new jobs, drain in-flight)
      if (worker !== undefined) {
        await worker.close();
        process.stderr.write('[shutdown] BullMQ worker closed.\n');
      }

      // 7. Kill signer co-process (after queues closed — no more signing needed)
      if (signerProcess !== undefined) {
        signerProcess.kill('SIGTERM');
        process.stderr.write(`[shutdown] Signer process (pid ${signerProcess.pid ?? 'unknown'}) sent SIGTERM.\n`);
      }

      // 8. Quit Redis (sends QUIT command, waits for acknowledgment)
      await redis.quit();
      process.stderr.write('[shutdown] Redis disconnected.\n');

      // 9. End Postgres pool (drains in-flight queries, prevents connection leaks)
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
