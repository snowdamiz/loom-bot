import 'dotenv/config';
import { db, pool, agentState, eq } from '@jarvis/db';
import { createDefaultRegistry, redis } from '@jarvis/tools';
import { Queue } from 'bullmq';
import { startConsolidation } from './memory-consolidation.js';
import { registerShutdownHandlers } from './shutdown.js';

/**
 * Main agent process entry point.
 *
 * Startup sequence:
 * 1. Create tool registry with all 4 default tools
 * 2. Create BullMQ Queue for dispatching jobs to worker processes
 * 3. Start memory consolidation periodic job
 * 4. Register graceful shutdown handlers (SIGTERM/SIGINT)
 * 5. Log startup to stderr
 * 6. Write system status to agent_state (DATA-01)
 *
 * This process does NOT start the autonomous planning loop (Phase 3).
 * It starts, registers everything, writes its state, and waits.
 * This is sufficient to verify Phase 1 infrastructure end-to-end.
 */

async function main(): Promise<void> {
  // 1. Create tool registry with all 4 tools (shell, http, file, db)
  const registry = createDefaultRegistry(db);

  // 2. Create BullMQ Queue for dispatching tool execution to worker processes
  const queue = new Queue('tool-execution', {
    connection: {
      url: process.env.REDIS_URL!,
    },
  });

  // 3. Start memory consolidation (runs every 5 minutes, also runs immediately)
  const consolidation = startConsolidation(db);

  // 4. Register graceful shutdown handlers with all resources
  registerShutdownHandlers({
    pool,
    redis,
    consolidation,
  });

  // 5. Log startup to stderr
  const toolCount = registry.count();
  process.stderr.write(`[agent] Jarvis agent started. Tools: ${toolCount}. Consolidation: active.\n`);

  // 6. Write system status to agent_state (DATA-01 persistence verification)
  const systemStatus = {
    status: 'running',
    startedAt: new Date().toISOString(),
    tools: registry.list().map((t) => t.name),
  };

  // Upsert: update if exists, insert if not
  const existing = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, 'system:status'))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(agentState)
      .set({ value: systemStatus, updatedAt: new Date() })
      .where(eq(agentState.key, 'system:status'));
  } else {
    await db
      .insert(agentState)
      .values({ key: 'system:status', value: systemStatus });
  }

  process.stderr.write('[agent] System status written to agent_state.\n');
  process.stderr.write(`[agent] Queue "${queue.name}" ready for worker dispatch.\n`);

  // The process stays alive — shutdown is handled by registerShutdownHandlers on SIGTERM/SIGINT.
}

// Run and handle startup errors
main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[agent] Fatal startup error: ${message}\n`);
  process.exit(1);
});

// Re-export resources for use by future phases
export { db } from '@jarvis/db';
