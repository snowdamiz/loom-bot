import 'dotenv/config';
import { db, pool, agentState, eq } from '@jarvis/db';
import { createDefaultRegistry, redis } from '@jarvis/tools';
import { createRouter, KillSwitchGuard, loadModelConfig, toolDefinitionsToOpenAI } from '@jarvis/ai';
import { Queue } from 'bullmq';
import { startConsolidation } from './memory-consolidation.js';
import { registerShutdownHandlers } from './shutdown.js';
import { GoalManager } from './loop/goal-manager.js';
import { AgentLoop } from './loop/agent-loop.js';
import { EvaluatorImpl } from './loop/evaluator.js';
import { ReplannerImpl } from './loop/replanner.js';
import { Supervisor } from './multi-agent/supervisor.js';
import { createSpawnAgentTool, createAwaitAgentTool, createCancelAgentTool } from './multi-agent/sub-agent-tool.js';
import { createAgentWorker } from './multi-agent/agent-worker.js';
import { detectCrashRecovery, performStartupRecovery } from './recovery/startup-recovery.js';

// Suppress unused import warning — AgentLoop is a transitive dependency of Supervisor
void AgentLoop;

/**
 * Main agent process entry point.
 *
 * Startup sequence:
 * 1. Create tool registry with all 4 default tools
 * 2. Create BullMQ Queue for dispatching jobs to worker processes
 * 3. Start memory consolidation periodic job
 * 4. Register graceful shutdown handlers (SIGTERM/SIGINT)
 * 5. Wire KillSwitchGuard and ModelRouter (Phase 2)
 * 6. Log startup to stderr
 * 7. Write system status to agent_state (DATA-01)
 * 8. Phase 3: Register sub-agent tools, create autonomous loop components,
 *    run startup recovery, start supervisor loop
 *
 * RECOV-03: Postgres-backed journal + BullMQ Redis survive Fly.io restarts.
 * The Fly.io `restart: always` policy ensures this process relaunches on crash.
 * On relaunch, detectCrashRecovery() reads active goals from Postgres and
 * performStartupRecovery() resumes them via the Supervisor's staggeredRestart().
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

  // 5. Wire Phase 2 components: KillSwitchGuard and ModelRouter
  const killSwitch = new KillSwitchGuard(db);
  const modelConfig = loadModelConfig();
  const router = createRouter(db, process.env.OPENROUTER_API_KEY!);

  // Log model config to stderr for verification
  process.stderr.write(
    `[agent] AI router ready. Models: strong=${modelConfig.strong}, mid=${modelConfig.mid}, cheap=${modelConfig.cheap}\n`
  );

  // 6. Log startup to stderr
  const toolCount = registry.count();
  process.stderr.write(`[agent] Jarvis agent started. Tools: ${toolCount}. Consolidation: active.\n`);

  // 7. Write system status to agent_state (DATA-01 persistence verification)
  const systemStatus = {
    status: 'running',
    startedAt: new Date().toISOString(),
    tools: registry.list().map((t) => t.name),
    aiRouter: 'ready',
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

  // === Phase 3: Autonomous Loop Bootstrap ===

  // Create agent-tasks queue for sub-agent jobs
  const agentTasksQueue = new Queue('agent-tasks', {
    connection: { url: process.env.REDIS_URL! },
  });

  // Register sub-agent tools in the registry
  registry.register(createSpawnAgentTool(agentTasksQueue));
  registry.register(createAwaitAgentTool(agentTasksQueue));
  registry.register(createCancelAgentTool(agentTasksQueue));

  // Convert tool registry to OpenAI format for LLM consumption
  const openAITools = toolDefinitionsToOpenAI(registry);

  // Create Phase 3 components: GoalManager, Evaluator, Replanner, Supervisor
  const goalManager = new GoalManager(db, router);
  const evaluator = new EvaluatorImpl(router, db);
  const replanner = new ReplannerImpl(goalManager, router, db);

  // Supervisor manages multiple independent main agent loops (one per active goal)
  const supervisor = new Supervisor(
    db,
    router,
    registry,
    killSwitch,
    goalManager,
    evaluator,
    replanner,
    openAITools,
  );

  // Create agent-tasks worker (processes sub-agent BullMQ jobs)
  const agentWorker = createAgentWorker({
    redisUrl: process.env.REDIS_URL!,
    router,
    registry,
    killSwitch,
    db,
    tools: openAITools,
  });

  // 4. Register graceful shutdown handlers with all Phase 3 resources
  registerShutdownHandlers({
    pool,
    redis,
    consolidation,
    supervisor,
    agentWorker,
    agentTasksQueue,
  });

  // Run startup recovery if needed (RECOV-02: resume from last journal checkpoint)
  const isRecovery = await detectCrashRecovery(db);
  if (isRecovery) {
    const result = await performStartupRecovery(db, supervisor, {
      discordBotToken: process.env.DISCORD_BOT_TOKEN,
      discordOperatorUserId: process.env.DISCORD_OPERATOR_USER_ID,
    });
    process.stderr.write(`[agent] Recovery complete: ${result.recovered} goals resumed.\n`);
  }

  // Start supervisor loop: spawns main agent loops for all active goals
  await supervisor.startSupervisorLoop();
  process.stderr.write('[agent] Autonomous loop started. Supervisor active.\n');

  process.stderr.write(`[agent] Phase 3 ready. Tools: ${registry.count()}. Goals: supervisor managed.\n`);

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
