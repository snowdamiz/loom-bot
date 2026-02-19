import 'dotenv/config';
import { db, pool, agentState, goals, eq } from '@jarvis/db';
import { createDefaultRegistry, redis, createBootstrapTools, createSelfExtensionTools, loadPersistedTools, createBrowserTools } from '@jarvis/tools';
import { BrowserManager } from '@jarvis/browser';
import { createRouter, KillSwitchGuard, loadModelConfig, toolDefinitionsToOpenAI, CreditMonitor, activateKillSwitch } from '@jarvis/ai';
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
import { StrategyManager } from './strategy/strategy-manager.js';
import { startOperatorChatRelay } from './chat/operator-chat-relay.js';

// Suppress unused import warning — AgentLoop is a transitive dependency of Supervisor
void AgentLoop;

const OPENROUTER_KEY_POLL_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve OpenRouter API key with DB-first precedence.
 *
 * Behavior:
 * - If DB key is present (configured by dashboard setup wizard), use it.
 * - Else if OPENROUTER_API_KEY env var is present, use it as fallback.
 * - Else wait and poll until the wizard writes the key.
 */
async function waitForOpenRouterApiKey(): Promise<string> {
  let warnedMissingKey = false;
  let warnedDbUnavailable = false;

  for (;;) {
    try {
      const openrouterKeyRow = await db
        .select()
        .from(agentState)
        .where(eq(agentState.key, 'config:openrouter_api_key'))
        .limit(1);

      const dbKey = (openrouterKeyRow[0]?.value as { apiKey?: string } | undefined)?.apiKey?.trim();
      const envKey = process.env.OPENROUTER_API_KEY?.trim();

      if (dbKey) {
        if (warnedMissingKey || warnedDbUnavailable) {
          process.stderr.write('[agent] OpenRouter API key detected from dashboard setup. Continuing startup.\n');
        }
        return dbKey;
      }

      if (envKey) {
        if (warnedMissingKey || warnedDbUnavailable) {
          process.stderr.write('[agent] OpenRouter API key detected from environment fallback. Continuing startup.\n');
        }
        return envKey;
      }

      if (!warnedMissingKey) {
        process.stderr.write(
          '[agent] OpenRouter API key not configured yet. Complete the dashboard setup wizard; retrying every 5s.\n',
        );
        warnedMissingKey = true;
      }
    } catch (err) {
      if (!warnedDbUnavailable) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[agent] Waiting for database readiness before OpenRouter key check: ${message}. Retrying every 5s.\n`,
        );
        warnedDbUnavailable = true;
      }
    }

    await sleep(OPENROUTER_KEY_POLL_MS);
  }
}

/**
 * Main agent process entry point.
 *
 * Startup sequence:
 * 1. Create tool registry with essential tools (primitives + multi-agent + bootstrap + self-extension + browser)
 *    Registered: shell, http, file, db (4 primitives)
 *               spawn_agent, await_agent, cancel_agent (3 multi-agent)
 *               package_install, tool_discover (2 bootstrap)
 *               tool_write, tool_delete, schema_extend (3 self-extension)
 *               browser_session_open/close/save, browser_navigate, browser_click,
 *               browser_fill, browser_extract, browser_screenshot (8 browser)
 *    Total: 20 tools
 * 2. Create BullMQ Queue for dispatching jobs to worker processes
 * 3. Start memory consolidation periodic job
 * 4. Wire KillSwitchGuard and ModelRouter
 * 5. On first boot (kill switch not yet set AND no goals): activate kill switch (agent starts OFF)
 * 6. Seed a paused self-evolution goal if goals table is empty
 * 7. Start supervisor loop
 *
 * Domain-specific tools (wallet, identity) are NOT registered at startup.
 * The agent can build or discover them later via tool_write/package_install if needed.
 *
 * RECOV-03: Postgres-backed journal + BullMQ Redis survive restarts.
 * On relaunch, detectCrashRecovery() reads active goals from Postgres and
 * performStartupRecovery() resumes them via the Supervisor's staggeredRestart().
 */

async function main(): Promise<void> {
  // 1. Create tool registry with 4 primitive tools (shell, http, file, db)
  const registry = createDefaultRegistry(db);

  // Browser automation — BrowserManager manages Chromium lifecycle
  const browserManager = new BrowserManager();

  // 2. Create BullMQ Queue for dispatching tool execution to worker processes
  const queue = new Queue('tool-execution', {
    connection: {
      url: process.env.REDIS_URL!,
    },
  });

  // 3. Start memory consolidation (runs every 5 minutes, also runs immediately)
  const consolidation = startConsolidation(db);

  // 4. Wire Phase 2 components: KillSwitchGuard and ModelRouter
  const killSwitch = new KillSwitchGuard(db);
  const modelConfig = loadModelConfig();

  // Resolve OpenRouter API key: DB (setup wizard) takes priority, env var is fallback.
  // If neither exists yet, wait until setup is completed.
  const openrouterApiKey = await waitForOpenRouterApiKey();

  const router = createRouter(db, openrouterApiKey);

  // CreditMonitor — polls OpenRouter balance, Discord DM on low credits
  const creditMonitor = new CreditMonitor(
    {
      apiKey: openrouterApiKey,
      discordBotToken: process.env.DISCORD_BOT_TOKEN,
      discordOperatorUserId: process.env.DISCORD_OPERATOR_USER_ID,
    },
    db,
  );
  creditMonitor.start();
  process.stderr.write('[agent] CreditMonitor started (polling every 5 minutes).\n');

  // Log model config to stderr for verification
  process.stderr.write(
    `[agent] AI router ready. Models: strong=${modelConfig.strong}, mid=${modelConfig.mid}, cheap=${modelConfig.cheap}\n`
  );

  // Log startup to stderr
  const toolCount = registry.count();
  process.stderr.write(`[agent] Jarvis agent started. Tools: ${toolCount}. Consolidation: active.\n`);

  // Write system status to agent_state (DATA-01 persistence verification)
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

  // === Multi-agent Bootstrap ===

  // Create agent-tasks queue for sub-agent jobs
  const agentTasksQueue = new Queue('agent-tasks', {
    connection: { url: process.env.REDIS_URL! },
  });

  // Register sub-agent tools in the registry (3 tools: spawn, await, cancel)
  registry.register(createSpawnAgentTool(agentTasksQueue));
  registry.register(createAwaitAgentTool(agentTasksQueue));
  registry.register(createCancelAgentTool(agentTasksQueue));

  // Register bootstrap tools (2 tools: package_install, tool_discover)
  const bootstrapTools = createBootstrapTools(registry);
  bootstrapTools.forEach((t) => registry.register(t));

  // === Self-Extension ===

  // Load agent-authored tools from disk (persisted from previous runs)
  const loadResult = await loadPersistedTools(registry);
  if (loadResult.loaded.length > 0) {
    process.stderr.write(
      `[agent] Loaded ${loadResult.loaded.length} persisted tool(s): ${loadResult.loaded.join(', ')}\n`,
    );
  }
  if (loadResult.failed.length > 0) {
    process.stderr.write(
      `[agent] Failed to load ${loadResult.failed.length} persisted tool(s): ${loadResult.failed.join(', ')}\n`,
    );
  }

  // Create reload-tools queue for worker synchronization
  const reloadToolsQueue = new Queue('reload-tools', {
    connection: { url: process.env.REDIS_URL! },
  });

  const onToolChange = () => {
    reloadToolsQueue.add('reload', {}).catch((err) => {
      process.stderr.write(
        `[agent] Failed to enqueue reload-tools job: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    });
  };

  // Register self-extension tools (3 tools: tool_write, tool_delete, schema_extend)
  const selfExtensionTools = createSelfExtensionTools(registry, db, onToolChange);
  selfExtensionTools.forEach((t) => registry.register(t));

  // Register browser tools (8 tools: session open/close/save, navigate, click, fill, extract, screenshot)
  const browserTools = createBrowserTools(browserManager);
  browserTools.forEach((t) => registry.register(t));

  process.stderr.write(
    `[agent] Essential tools registered. Bootstrap: ${bootstrapTools.length}, Self-extension: ${selfExtensionTools.length}, ` +
      `Browser: ${browserTools.length}. Persisted: ${loadResult.loaded.length} loaded. Total: ${registry.count()}\n`,
  );

  // Convert tool registry to OpenAI format for LLM consumption
  const openAITools = toolDefinitionsToOpenAI(registry);

  // Create Phase 3 components: GoalManager, Evaluator, Replanner, Supervisor
  const goalManager = new GoalManager(db, router);
  const evaluator = new EvaluatorImpl(router, db);
  const replanner = new ReplannerImpl(goalManager, router, db);

  // StrategyManager wired at startup (domain-agnostic strategy lifecycle)
  const strategyManager = new StrategyManager(db, goalManager);
  process.stderr.write('[agent] StrategyManager wired into Supervisor.\n');

  // === Kill Switch: Ensure agent starts OFF on first boot ===
  // If kill switch is not yet set AND no goals exist → activate kill switch
  // This guarantees the agent is dormant until the operator enables it after setup.
  const killSwitchRows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.key, 'kill_switch'))
    .limit(1);

  const killSwitchValue = killSwitchRows[0]?.value as { active?: boolean } | undefined;
  const killSwitchAlreadySet = killSwitchValue !== undefined;

  if (!killSwitchAlreadySet) {
    await activateKillSwitch(
      db,
      'Initial setup — agent starts in OFF state',
      'system',
    );
    process.stderr.write('[agent] Kill switch activated: first boot, agent starts OFF.\n');
  } else {
    process.stderr.write(
      `[agent] Kill switch already set (active=${String(killSwitchValue?.active ?? false)}).\n`,
    );
  }

  // === Seed Goal: Self-evolution mission ===
  // If goals table is empty, insert a paused seed goal describing the agent's purpose.
  // This goal is NOT active — the operator must unpause it after activating the agent.
  const existingGoals = await db.select().from(goals).limit(1);

  if (existingGoals.length === 0) {
    await db.insert(goals).values({
      description:
        'Bootstrap self-evolution capabilities. You are a self-improving autonomous agent. ' +
        'Your mission: (1) Analyze what tools and integrations you currently have, ' +
        '(2) Identify what you need to build to become more capable, ' +
        '(3) Use your self-extension tools (tool_write, schema_extend, package_install) to build new capabilities, ' +
        '(4) Use GitHub integration for safe code changes via branches. ' +
        'Start by understanding your environment and planning your first capability expansion.',
      source: 'system-seed',
      status: 'paused',
      priority: 10,
      pauseReason: 'Awaiting operator activation after setup completion',
    });
    process.stderr.write('[agent] Seed goal inserted: self-evolution mission (paused).\n');
  }

  // === Supervisor + Worker ===

  // Supervisor manages multiple independent main agent loops (one per active goal).
  const supervisor = new Supervisor(
    db,
    router,
    registry,
    killSwitch,
    goalManager,
    evaluator,
    replanner,
    openAITools,
    strategyManager,
  );

  // Create agent-tasks worker (processes sub-agent BullMQ jobs).
  const agentWorker = createAgentWorker({
    redisUrl: process.env.REDIS_URL!,
    router,
    registry,
    killSwitch,
    db,
  });

  // Start operator chat relay (dashboard /api/chat -> live agent tools/LLM loop).
  const chatRelay = startOperatorChatRelay({
    db,
    router,
    registry,
    killSwitch,
  });

  // Register graceful shutdown handlers
  registerShutdownHandlers({
    pool,
    redis,
    consolidation,
    chatRelay,
    supervisor,
    agentWorker,
    agentTasksQueue,
    reloadToolsQueue,
    creditMonitor,
    browserManager,
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

  process.stderr.write(`[agent] All phases ready. Tools: ${registry.count()}. Goals: supervisor managed.\n`);

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
