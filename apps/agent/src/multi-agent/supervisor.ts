import type { ModelRouter, ToolCompletionRequest } from '@jarvis/ai';
import type { DbClient } from '@jarvis/db';
import type { ToolRegistry } from '@jarvis/tools';
import type { GoalManager } from '../loop/goal-manager.js';
import type { Evaluator } from '../loop/evaluator.js';
import type { Replanner } from '../loop/replanner.js';
import { AgentLoop } from '../loop/agent-loop.js';

/**
 * Re-use ChatCompletionTool from @jarvis/ai's ToolCompletionRequest.
 * Avoids direct openai dependency in @jarvis/agent (pnpm strict isolation).
 */
type ChatCompletionTool = ToolCompletionRequest['tools'][number];

/**
 * Duck-typed kill-switch interface — same pattern as agent-loop.ts.
 */
interface KillCheckable {
  assertActive(): Promise<void>;
}

export interface SupervisorConfig {
  /** Maximum number of concurrently running main agent loops (default: 5) */
  maxConcurrentMainAgents?: number;
  /** Milliseconds between supervisor loop iterations (default: 10_000) */
  supervisorIntervalMs?: number;
  /** Milliseconds to wait between staggered restarts (default: 2_000) */
  staggerDelayMs?: number;
}

/**
 * MULTI-05: Supervisor — manages multiple independent main agent loops.
 *
 * Responsibilities:
 * - Spawn one AgentLoop per active goal (up to concurrency cap)
 * - Stop loops for goals that are no longer active (completed/paused)
 * - Staggered restart after crash/restart to avoid resource spikes
 * - Periodic reconciliation between DB state and running loops
 *
 * Design (MULTI-06): Supervisor does NOT decide spawn-vs-inline for sub-agents.
 * That decision is made by the LLM via tool description guidance. Supervisor only
 * manages the lifecycle of main agent loops (one per top-level goal).
 */
export class Supervisor {
  /** Running agent loops, keyed by goalId */
  private readonly activeLoops = new Map<number, AgentLoop>();

  private readonly maxConcurrentMainAgents: number;
  private readonly supervisorIntervalMs: number;
  private readonly staggerDelayMs: number;

  /** Supervisor loop cancellation handle */
  private supervisorTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: DbClient,
    private readonly router: ModelRouter,
    private readonly registry: ToolRegistry,
    private readonly killSwitch: KillCheckable,
    private readonly goalManager: GoalManager,
    private readonly evaluator: Evaluator,
    private readonly replanner: Replanner,
    private readonly tools: ChatCompletionTool[],
    config?: SupervisorConfig,
  ) {
    this.maxConcurrentMainAgents = config?.maxConcurrentMainAgents ?? 5;
    this.supervisorIntervalMs = config?.supervisorIntervalMs ?? 10_000;
    this.staggerDelayMs = config?.staggerDelayMs ?? 2_000;
  }

  /**
   * Spawn a new AgentLoop for the given goal.
   *
   * Respects the concurrency cap — does NOT block if at cap.
   * Logs a warning and returns if cap is reached; caller can retry later.
   *
   * @param goalId - The goal to spawn a main agent for
   */
  async spawnMainAgent(goalId: number): Promise<void> {
    if (this.activeLoops.has(goalId)) {
      process.stderr.write(`[supervisor] Main agent for goal ${goalId} is already running.\n`);
      return;
    }

    if (this.activeLoops.size >= this.maxConcurrentMainAgents) {
      process.stderr.write(
        `[supervisor] Concurrency cap reached (${this.maxConcurrentMainAgents}). ` +
        `Cannot spawn agent for goal ${goalId}. Will retry on next cycle.\n`,
      );
      return;
    }

    const agentLoop = new AgentLoop(
      this.router,
      this.registry,
      this.killSwitch,
      this.db,
      this.goalManager,
      this.tools,
      this.evaluator,
      this.replanner,
    );

    this.activeLoops.set(goalId, agentLoop);

    process.stderr.write(`[supervisor] Spawning main agent for goal ${goalId}.\n`);

    // Fire-and-forget: run the goal cycle in background
    agentLoop.runGoalCycle(goalId).then(() => {
      // Goal cycle completed normally — clean up
      this.activeLoops.delete(goalId);
      process.stderr.write(`[supervisor] Main agent for goal ${goalId} completed.\n`);
    }).catch((err: unknown) => {
      // Goal cycle failed — clean up and log
      this.activeLoops.delete(goalId);
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[supervisor] Main agent for goal ${goalId} crashed: ${message}\n`);
    });
  }

  /**
   * Stop the main agent for the given goal by setting its cancellation flag.
   *
   * The AgentLoop will exit on the next loop iteration check.
   * The loop cleans itself up from activeLoops via the fire-and-forget error handler.
   *
   * @param goalId - The goal to stop the main agent for
   */
  async stopMainAgent(goalId: number): Promise<void> {
    const agentLoop = this.activeLoops.get(goalId);
    if (!agentLoop) {
      process.stderr.write(`[supervisor] No active agent for goal ${goalId}. Nothing to stop.\n`);
      return;
    }

    process.stderr.write(`[supervisor] Stopping main agent for goal ${goalId}.\n`);
    agentLoop.cancel();
    this.activeLoops.delete(goalId);
  }

  /**
   * Returns the number of currently active main agent loops.
   */
  getActiveAgentCount(): number {
    return this.activeLoops.size;
  }

  /**
   * Returns the goal IDs of all currently active main agent loops.
   */
  getActiveGoalIds(): number[] {
    return Array.from(this.activeLoops.keys());
  }

  /**
   * Start the supervisor periodic reconciliation loop.
   *
   * Every supervisorIntervalMs:
   * 1. Fetch active goals from DB
   * 2. Spawn agents for active goals not yet running
   * 3. Stop agents for goal IDs no longer in active goals list
   *
   * Returns immediately — the loop runs in background via setInterval.
   */
  async startSupervisorLoop(): Promise<void> {
    process.stderr.write('[supervisor] Starting supervisor loop.\n');

    const tick = async () => {
      try {
        const activeGoals = await this.goalManager.getActiveGoals();
        const activeGoalIds = new Set(activeGoals.map((g) => g.id));

        // Spawn agents for active goals not yet running
        for (const goal of activeGoals) {
          if (!this.activeLoops.has(goal.id)) {
            await this.spawnMainAgent(goal.id);
          }
        }

        // Stop agents for goals no longer active (completed/paused/abandoned)
        for (const runningGoalId of this.activeLoops.keys()) {
          if (!activeGoalIds.has(runningGoalId)) {
            await this.stopMainAgent(runningGoalId);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[supervisor] Supervisor loop error: ${message}\n`);
      }
    };

    // Run once immediately, then on interval
    await tick();
    this.supervisorTimer = setInterval(() => {
      tick().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[supervisor] Supervisor tick error: ${message}\n`);
      });
    }, this.supervisorIntervalMs);
  }

  /**
   * Stop the supervisor reconciliation loop (does not stop running agent loops).
   */
  stopSupervisorLoop(): void {
    if (this.supervisorTimer !== null) {
      clearInterval(this.supervisorTimer);
      this.supervisorTimer = null;
      process.stderr.write('[supervisor] Supervisor loop stopped.\n');
    }
  }

  /**
   * MULTI-05: Staggered restart — spawns agents for all active goals one at a time
   * with a configurable delay between each to avoid resource spikes after restart.
   *
   * Used after agent process restart to resume in-progress goals safely.
   */
  async staggeredRestart(): Promise<void> {
    process.stderr.write('[supervisor] Beginning staggered restart.\n');

    const activeGoals = await this.goalManager.getActiveGoals();

    for (const goal of activeGoals) {
      await this.spawnMainAgent(goal.id);
      if (activeGoals.indexOf(goal) < activeGoals.length - 1) {
        // Wait between spawns to stagger resource usage
        await sleep(this.staggerDelayMs);
      }
    }

    process.stderr.write(
      `[supervisor] Staggered restart complete: ${activeGoals.length} goals resumed.\n`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
