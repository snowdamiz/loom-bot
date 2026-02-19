import 'dotenv/config';
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { db, pool, agentState, eq } from '@jarvis/db';
import { createDefaultRegistry, redis, createWalletTools, createBrowserTools, createIdentityTools, createBootstrapTools, createSelfExtensionTools, loadPersistedTools } from '@jarvis/tools';
import { createRouter, KillSwitchGuard, loadModelConfig, toolDefinitionsToOpenAI, CreditMonitor } from '@jarvis/ai';
import { BrowserManager } from '@jarvis/browser';
import { SignerClient, subscribeToWallet } from '@jarvis/wallet';
import { Queue } from 'bullmq';
import { startConsolidation } from './memory-consolidation.js';
import { registerShutdownHandlers } from './shutdown.js';
import type { ShutdownSignerProcess, ShutdownBrowserManager } from './shutdown.js';
import { GoalManager } from './loop/goal-manager.js';
import { AgentLoop } from './loop/agent-loop.js';
import { EvaluatorImpl } from './loop/evaluator.js';
import { ReplannerImpl } from './loop/replanner.js';
import { Supervisor } from './multi-agent/supervisor.js';
import { createSpawnAgentTool, createAwaitAgentTool, createCancelAgentTool } from './multi-agent/sub-agent-tool.js';
import { createAgentWorker } from './multi-agent/agent-worker.js';
import { detectCrashRecovery, performStartupRecovery } from './recovery/startup-recovery.js';
import { StrategyManager } from './strategy/strategy-manager.js';

// Suppress unused import warning — AgentLoop is a transitive dependency of Supervisor
void AgentLoop;

/**
 * Main agent process entry point.
 *
 * Startup sequence:
 * 1. Create tool registry with all 4 default tools
 * 2. Create BullMQ Queue for dispatching jobs to worker processes
 * 3. Start memory consolidation periodic job
 * 5. Wire KillSwitchGuard and ModelRouter (Phase 2)
 * 6. Log startup to stderr
 * 7. Write system status to agent_state (DATA-01)
 * 8. Phase 3: Register sub-agent tools, create autonomous loop components,
 *    run startup recovery, start supervisor loop
 * 9. Phase 4: Start signer co-process, create SignerClient, register wallet tools,
 *    start inbound wallet monitoring
 *
 * RECOV-03: Postgres-backed journal + BullMQ Redis survive Fly.io restarts.
 * The Fly.io `restart: always` policy ensures this process relaunches on crash.
 * On relaunch, detectCrashRecovery() reads active goals from Postgres and
 * performStartupRecovery() resumes them via the Supervisor's staggeredRestart().
 *
 * Phase 4 wallet features degrade gracefully if SOLANA_PRIVATE_KEY is not set:
 * - Signer co-process is not started
 * - Wallet tools are not registered
 * - Inbound monitoring is not started
 * - The agent continues running without wallet capabilities
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

  // Phase 9: CreditMonitor — polls OpenRouter balance, Discord DM on low credits
  const creditMonitor = new CreditMonitor(
    {
      apiKey: process.env.OPENROUTER_API_KEY!,
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
  let openAITools = toolDefinitionsToOpenAI(registry);

  // Create Phase 3 components: GoalManager, Evaluator, Replanner, Supervisor
  const goalManager = new GoalManager(db, router);
  const evaluator = new EvaluatorImpl(router, db);
  const replanner = new ReplannerImpl(goalManager, router, db);

  // Phase 7: StrategyManager wired at startup (domain-agnostic strategy lifecycle)
  const strategyManager = new StrategyManager(db, goalManager);
  process.stderr.write('[agent] StrategyManager wired into Supervisor.\n');

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
    strategyManager,
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

  // === Phase 4: Wallet Integration ===

  // Wallet features are optional — only enabled if SOLANA_PRIVATE_KEY is set.
  // If the key is not configured, the agent runs without wallet capabilities.
  const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;
  const SIGNER_SOCKET_PATH = process.env.SIGNER_SOCKET_PATH ?? '/tmp/jarvis-signer.sock';
  const SIGNER_SHARED_SECRET = process.env.SIGNER_SHARED_SECRET;

  let signerProcess: ShutdownSignerProcess | undefined;
  let walletSubscription: { stop: () => void } | undefined;

  if (!SOLANA_PRIVATE_KEY) {
    process.stderr.write(
      '[agent] SOLANA_PRIVATE_KEY not set — skipping wallet initialization. Wallet tools will not be available.\n',
    );
  } else if (!SIGNER_SHARED_SECRET) {
    process.stderr.write(
      '[agent] SIGNER_SHARED_SECRET not set — skipping wallet initialization. Set both SOLANA_PRIVATE_KEY and SIGNER_SHARED_SECRET to enable wallet.\n',
    );
  } else {
    // --- Step 1: Start signer co-process ---
    // Resolve signer server path from @jarvis/wallet package installed in node_modules.
    // createRequire resolves relative to the current module's URL.
    const require = createRequire(import.meta.url);
    const signerServerPath = require.resolve('@jarvis/wallet/dist/signer/server.js');

    const signerChild = fork(signerServerPath, [], {
      env: {
        ...process.env,
        SIGNER_SOCKET_PATH,
        SIGNER_SHARED_SECRET,
        SOLANA_PRIVATE_KEY,
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    signerProcess = signerChild;

    // Pipe signer stdout/stderr to agent's stderr with [signer] prefix
    if (signerChild.stdout) {
      signerChild.stdout.on('data', (chunk: Buffer) => {
        process.stderr.write(`[signer] ${chunk.toString('utf8')}`);
      });
    }
    if (signerChild.stderr) {
      signerChild.stderr.on('data', (chunk: Buffer) => {
        process.stderr.write(`[signer] ${chunk.toString('utf8')}`);
      });
    }

    // Wait for signer 'ready' message (sent via process.send() from server.ts)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Signer co-process did not send ready message within 10s'));
      }, 10_000);

      signerChild.on('message', (msg) => {
        if (msg === 'ready') {
          clearTimeout(timeout);
          resolve();
        }
      });

      signerChild.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      signerChild.on('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Signer co-process exited with code ${String(code)} before sending ready`));
      });
    });

    process.stderr.write(`[agent] Signer co-process ready (pid: ${signerChild.pid ?? 'unknown'}).\n`);

    // --- Step 2: Create SignerClient ---
    const signerClient = new SignerClient(SIGNER_SOCKET_PATH, SIGNER_SHARED_SECRET);
    const pingResult = await signerClient.ping();
    process.stderr.write(
      `[agent] SignerClient ping: ${pingResult ? 'SUCCESS' : 'FAILED — signer may not be accepting connections'}\n`,
    );

    // --- Step 3: Create and register wallet tools ---
    const walletTools = createWalletTools(db, signerClient);
    walletTools.forEach((t) => registry.register(t));
    process.stderr.write(
      `[agent] Wallet tools registered: ${walletTools.map((t) => t.name).join(', ')}\n`,
    );

    // Re-derive openAITools after wallet tool registration so the LLM sees all tools
    openAITools = toolDefinitionsToOpenAI(registry);

    // --- Step 4: Start inbound wallet monitoring ---
    // Best-effort: if wss_url is not configured in wallet_config, catch and log (don't crash)
    try {
      walletSubscription = await subscribeToWallet(db, (event) => {
        process.stderr.write(`[wallet] Inbound: ${JSON.stringify(event)}\n`);
      });
      process.stderr.write('[agent] Wallet inbound monitoring active.\n');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[agent] Wallet subscription failed (non-fatal — wss_url may not be configured): ${msg}\n`,
      );
    }
  }

  // === Phase 6: Browser, Identity, and Bootstrapping ===

  // Browser manager lifecycle (always available — no env var gating)
  const browserManager = new BrowserManager();

  // Register browser tools (8 tools: session open/close/save, navigate, click, fill, extract, screenshot)
  const browserTools = createBrowserTools(browserManager);
  browserTools.forEach((t) => registry.register(t));

  // Register identity tools (7 tools: identity_create, credential_store/retrieve, temp_email_create/check, identity_retire, request_operator_credentials)
  const identityTools = createIdentityTools(db);
  identityTools.forEach((t) => registry.register(t));

  // Register bootstrap tools (2 tools: package_install, tool_discover)
  const bootstrapTools = createBootstrapTools(registry);
  bootstrapTools.forEach((t) => registry.register(t));

  // Re-derive openAITools after Phase 6 registration so the LLM sees all tools
  openAITools = toolDefinitionsToOpenAI(registry);

  // Validate CREDENTIAL_ENCRYPTION_KEY at startup (warn, don't crash — identity tools degrade gracefully)
  if (!process.env.CREDENTIAL_ENCRYPTION_KEY) {
    process.stderr.write(
      '[agent] WARNING: CREDENTIAL_ENCRYPTION_KEY not set — credential vault tools will fail. ' +
        'Set this env var to enable encrypted credential storage.\n',
    );
  }

  process.stderr.write(
    `[agent] Phase 6 ready. Browser: ${browserTools.length} tools, Identity: ${identityTools.length} tools, Bootstrap: ${bootstrapTools.length} tools. Total: ${registry.count()}\n`,
  );

  // === Phase 8: Self-Extension ===

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

  // Create reload-tools queue for worker synchronization (Phase 8)
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
  const selfExtensionTools = createSelfExtensionTools(registry, onToolChange);
  selfExtensionTools.forEach((t) => registry.register(t));

  // Re-derive openAITools after Phase 8 registration so the LLM sees all tools
  openAITools = toolDefinitionsToOpenAI(registry);

  process.stderr.write(
    `[agent] Phase 8 ready. Self-extension: ${selfExtensionTools.length} tools. ` +
      `Persisted: ${loadResult.loaded.length} loaded, ${loadResult.failed.length} failed. ` +
      `Total: ${registry.count()}\n`,
  );

  // 4. Register graceful shutdown handlers with all Phase 3, 4, 6 + 8 resources
  registerShutdownHandlers({
    pool,
    redis,
    consolidation,
    supervisor,
    agentWorker,
    agentTasksQueue,
    signerProcess,
    walletSubscription,
    browserManager: browserManager as ShutdownBrowserManager,
    reloadToolsQueue,
    creditMonitor,
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
