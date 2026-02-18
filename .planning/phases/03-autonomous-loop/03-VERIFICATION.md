---
phase: 03-autonomous-loop
verified: 2026-02-18T00:00:00Z
status: passed
score: 20/20 must-haves verified
re_verification: null
gaps: []
human_verification:
  - test: "Run agent process and inject a goal via DB, observe it decompose and execute through at least one sub-goal"
    expected: "Sub-goal executes tool calls through LLM, outcome is written to sub_goals.outcome, journal checkpoint is written to agent_state"
    why_human: "Requires live OpenRouter credentials, Redis, and Postgres to verify end-to-end LLM tool-calling loop at runtime"
  - test: "Kill agent process while a goal is active (status='active', sub-goal status='in-progress'), restart process"
    expected: "Startup recovery detects active goals, Discord DM sent (if tokens set), in-progress sub-goal reset to 'pending', supervisor staggered-restarts goal execution"
    why_human: "Crash recovery requires observing runtime behavior across process restarts with live infrastructure"
  - test: "Trigger 6+ replans on a single goal (mock divergence detection)"
    expected: "Goal is paused after hitting replan limit, operator receives Discord DM, pauseReason is set in goals table"
    why_human: "Requires live LLM evaluation cycle accumulating real EvaluationResult structs"
---

# Phase 3: Autonomous Loop Verification Report

**Phase Goal:** The agent runs as a continuous goal-planner — setting goals, decomposing them, dispatching work through the task queue, evaluating outcomes, replanning when needed, and surviving crashes without losing progress. The main agent can spawn focused sub-agents for parallel task execution.
**Verified:** 2026-02-18
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                               | Status     | Evidence                                                                                   |
|----|-----------------------------------------------------------------------------------------------------|------------|--------------------------------------------------------------------------------------------|
| 1  | Goals and sub-goals persist to Postgres with dependency tracking                                    | VERIFIED   | `goals.ts` and `sub-goals.ts` pgTable definitions exist; FK `goalId.references(() => goals.id)` confirmed; both exported from `@jarvis/db` index |
| 2  | ModelRouter can send tool-calling requests to OpenRouter                                            | VERIFIED   | `OpenRouterProvider.completeWithTools` calls `this.client.chat.completions.create` with `tools` and `tool_choice: 'auto'` |
| 3  | Tool registry Zod schemas convert to OpenAI JSON Schema format                                     | VERIFIED   | `toolDefinitionsToOpenAI` and `zodToJsonSchema` fully implemented in `tool-schema.ts`; exported from `@jarvis/ai` |
| 4  | Agent decomposes goals into prioritized sub-goals with dependencies                                 | VERIFIED   | `GoalManager.decomposeGoal` uses `planGoalDecomposition` (LLM via `router.complete('strong')`), resolves 0-based indices to actual DB IDs in a second pass |
| 5  | Agent executes sub-goals by invoking tools through LLM tool-calling protocol                        | VERIFIED   | `AgentLoop.executeSubGoal` implements the full LLM → `tool_calls` → `invokeWithKillCheck` → append results → repeat cycle with all `finish_reason` branches handled |
| 6  | Agent runs continuous planning cycles without human intervention                                    | VERIFIED   | `AgentLoop.runContinuousLoop` is an infinite loop over `getActiveGoals()` → `runGoalCycle()`; `runGoalCycle` is started per goal by `Supervisor.spawnMainAgent` |
| 7  | Agent prioritizes sub-goals by expected value and dependency ordering                               | VERIFIED   | `GoalManager.getNextSubGoal` returns the first `pending` sub-goal (ordered by `priority ASC`) whose all `dependsOn` dependencies are `'completed'` or `'skipped'` |
| 8  | Agent evaluates outcomes and triggers replanning on divergence                                      | VERIFIED   | `AgentLoop.runGoalCycle` calls `evaluator.evaluateOutcome` then `evaluator.shouldReplan`; when true calls `replanner.replan`; dual detection (metric triggers + LLM) in `EvaluatorImpl` |
| 9  | Main agent spawns sub-agents, receives jobId, can cancel them                                       | VERIFIED   | `createSpawnAgentTool`, `createAwaitAgentTool`, `createCancelAgentTool` implemented; spawn enqueues to `agent-tasks` BullMQ queue |
| 10 | Sub-agents run with isolated LLM context                                                            | VERIFIED   | `createAgentWorker` job processor creates fresh `messages[]` per job; no shared context with parent |
| 11 | Sub-agents report structured results via BullMQ job return value                                    | VERIFIED   | Worker returns `{ success: true, result: message.content }` or `{ success: false, error: ... }` as job.returnvalue; `await-agent` polls and returns it |
| 12 | Main agent can cancel running sub-agents                                                            | VERIFIED   | `cancel-agent` tool calls `job.moveToFailed(new Error('Cancelled by parent agent'), 'cancel-agent', true)` |
| 13 | Sub-agents share same ModelRouter (shared cost pool) with independent LLM sessions                  | VERIFIED   | `createAgentWorker` receives shared `router` dep; each job gets isolated `messages[]`; all calls log to `ai_calls` via router |
| 14 | Main agent decides spawn-vs-inline via LLM prompt guidance                                         | VERIFIED   | `spawn-agent` tool description explicitly guides LLM: "Do NOT spawn sub-agents for simple, fast tasks — execute those inline" |
| 15 | Failed calls retry with exponential backoff, exhausted retries preserved in DLQ                    | VERIFIED   | `createRetryJobOptions` returns `attempts:5, backoff:{type:'exponential',delay:1000}, removeOnFail:false`; `worker.ts` uses `isTransientError` + `UnrecoverableError` |
| 16 | Recurring tasks fire on cron schedule surviving process restarts                                    | VERIFIED   | `scheduleRecurringTask` and `scheduleFixedInterval` both call `queue.upsertJobScheduler` (Redis-persisted) |
| 17 | Agent journals each sub-goal completion before proceeding                                          | VERIFIED   | `AgentLoop.runGoalCycle` calls `await checkpoint(this.db, goalId, {...})` immediately after `executeSubGoal`; checkpoint has 3-retry-halt semantics |
| 18 | On restart, agent resumes from last journal checkpoint                                              | VERIFIED   | `performStartupRecovery` reads journal, resets `in-progress` sub-goals to `'pending'`, calls `supervisor.staggeredRestart()` |
| 19 | Incomplete planning cycles detected and handled on recovery                                         | VERIFIED   | `startup-recovery.ts` queries `planningCycles` where `status='active'`, inserts completion row with `status='interrupted'` (LOG-05 two-row pattern) |
| 20 | Supervisor manages concurrent main agents with staggered restart after crash                       | VERIFIED   | `Supervisor.staggeredRestart` spawns agents with configurable delay; `startSupervisorLoop` runs periodic reconciliation; concurrency cap enforced |

**Score: 20/20 truths verified**

---

## Required Artifacts

| Artifact | Provides | Status | Notes |
|----------|----------|--------|-------|
| `packages/db/src/schema/goals.ts` | Goal lifecycle table | VERIFIED | `pgTable('goals')` with all required columns; exports `Goal`, `NewGoal` |
| `packages/db/src/schema/sub-goals.ts` | Sub-goal table with dependsOn JSONB | VERIFIED | `pgTable('sub_goals')` with FK to goals; exports `SubGoal`, `NewSubGoal` |
| `packages/ai/src/provider.ts` | Extended AiProvider with `completeWithTools` | VERIFIED | Interface has `completeWithTools(req: ToolCompletionRequest): Promise<ToolCompletionResponse>` |
| `packages/ai/src/openrouter.ts` | OpenRouterProvider tool-calling impl | VERIFIED | `completeWithTools` method calls `create` with `tools`, `tool_choice:'auto'`; does not throw on `content=null` |
| `packages/ai/src/router.ts` | ModelRouter.completeWithTools | VERIFIED | Method resolves tier, delegates to `this.provider.completeWithTools`, logs to `ai_calls` |
| `packages/ai/src/tool-schema.ts` | Zod-to-OpenAI JSON Schema converter | VERIFIED | `toolDefinitionsToOpenAI` + `zodToJsonSchema` fully implemented; no new deps |
| `apps/agent/src/loop/goal-manager.ts` | GoalManager class | VERIFIED | All 9 methods present and substantive; imports from `@jarvis/db` and `./planner.js` |
| `apps/agent/src/loop/planner.ts` | `planGoalDecomposition` + `planNextAction` | VERIFIED | Both async functions exported; LLM calls with `'strong'` and `'mid'` tiers respectively |
| `apps/agent/src/loop/agent-loop.ts` | AgentLoop class | VERIFIED | `executeSubGoal`, `runGoalCycle`, `runContinuousLoop`, `cancel()` all present; checkpoint wired |
| `apps/agent/src/multi-agent/sub-agent-tool.ts` | spawn/await/cancel-agent tools | VERIFIED | Three factory functions exported; BullMQ queue wiring correct |
| `apps/agent/src/multi-agent/agent-worker.ts` | BullMQ sub-agent worker | VERIFIED | `createAgentWorker` returns `Worker` on `'agent-tasks'`; isolated messages per job |
| `apps/agent/src/queue/retry-config.ts` | Retry config with exponential backoff | VERIFIED | `createRetryJobOptions`, `isTransientError`, `wrapWithTransientCheck` exported |
| `apps/agent/src/queue/scheduler.ts` | Cron and fixed-interval scheduler | VERIFIED | `scheduleRecurringTask`, `scheduleFixedInterval`, `enqueueAsyncTask` use `upsertJobScheduler` |
| `apps/agent/src/worker.ts` | Updated worker with DLQ preservation | VERIFIED | `isTransientError` imported; `UnrecoverableError` used for non-transient failures; `removeOnFail` comment explains BullMQ default |
| `apps/agent/src/loop/evaluator.ts` | Dual divergence detection | VERIFIED | `EvaluatorImpl` implements `Evaluator` interface; metric triggers + LLM eval (`'cheap'` tier) |
| `apps/agent/src/loop/replanner.ts` | Replan logic with operator escalation | VERIFIED | `ReplannerImpl` implements `Replanner`; limit enforcement, Discord DM, goal pause |
| `apps/agent/src/multi-agent/supervisor.ts` | Multi-agent supervisor | VERIFIED | `Supervisor` class with `spawnMainAgent`, `stopMainAgent`, `staggeredRestart`, `startSupervisorLoop` |
| `apps/agent/src/multi-agent/result-collector.ts` | Sub-agent result aggregator | VERIFIED | `ResultCollector` with `collectResults` (parallel polling, timeout) and `getJobStatus` |
| `apps/agent/src/recovery/journal.ts` | Checkpoint write/read system | VERIFIED | `checkpoint` (3-retry-halt), `readJournal`, `clearJournal`, `getCompletedSubGoalIds` on `agent_state` table |
| `apps/agent/src/recovery/startup-recovery.ts` | On-boot recovery | VERIFIED | `performStartupRecovery` and `detectCrashRecovery`; Discord DM, cycle interruption, sub-goal reset, staggered restart |
| `apps/agent/src/index.ts` | Full autonomous loop bootstrap | VERIFIED | Imports all Phase 3 components; creates `Supervisor`, `EvaluatorImpl`, `ReplannerImpl`; registers sub-agent tools; calls `detectCrashRecovery`, `performStartupRecovery`, `supervisor.startSupervisorLoop()` |
| `apps/agent/src/shutdown.ts` | Graceful shutdown with Phase 3 resources | VERIFIED | `ShutdownResources` includes `supervisor`, `agentWorker`, `agentTasksQueue`; all closed in sequence |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `router.ts` | `provider.ts` | `this.provider.completeWithTools` delegation | WIRED | Line 83: `await this.provider.completeWithTools({...})` |
| `openrouter.ts` | openai SDK `chat.completions.create` | `tools` parameter | WIRED | Lines 65-73: `create({..., tools: req.tools, tool_choice: 'auto', ...})` |
| `sub-goals.ts` | `goals.ts` | `goalId` foreign key reference | WIRED | Line 13: `.references(() => goals.id)` |
| `agent-loop.ts` | `router.ts` | `router.completeWithTools` | WIRED | Line 137: `await this.router.completeWithTools(messages, 'strong', this.tools, ...)` |
| `agent-loop.ts` | `invokeWithKillCheck` | Tool execution | WIRED | Line 167: `await invokeWithKillCheck(this.killSwitch, this.registry, this.db, ...)` |
| `goal-manager.ts` | `goals`/`subGoals` tables | Drizzle insert/update/select | WIRED | `db.insert(goals)`, `db.select().from(subGoals)`, `db.update(subGoals)` throughout |
| `agent-loop.ts` | `evaluator.ts` | Optional evaluator after each sub-goal | WIRED | Lines 315-316: `await this.evaluator.evaluateOutcome(subGoal, result.outcome, goalDescription)` |
| `agent-loop.ts` | `replanner.ts` | Optional replanner on divergence | WIRED | Lines 326-328: `await this.replanner.replan(goalId, evaluation.reason ?? 'divergence detected')` |
| `sub-agent-tool.ts` | BullMQ Queue | `queue.add` for spawning | WIRED | Line 29: `await queue.add('sub-agent', {task, context}, {...})` |
| `agent-worker.ts` | `router.ts` | `router.completeWithTools` for sub-agent loop | WIRED | Line 84: `await router.completeWithTools(messages, 'mid', deps.tools)` |
| `sub-agent-tool.ts` | `agent-worker.ts` | `'agent-tasks'` queue name | WIRED | Tool adds to `'agent-tasks'`; Worker created on `'agent-tasks'` in both files |
| `evaluator.ts` | `router.ts` | LLM evaluation via `router.complete` | WIRED | Line 143: `await this.router.complete([...], 'cheap', ...)` |
| `replanner.ts` | `goal-manager.ts` | `goalManager.incrementReplanCount`, `updateGoalStatus`, `updateSubGoalStatus` | WIRED | Lines 67, 78, 135, 151 |
| `supervisor.ts` | `agent-loop.ts` | `new AgentLoop` + `agentLoop.runGoalCycle` | WIRED | Lines 93-102, 109: `new AgentLoop(...)` then `agentLoop.runGoalCycle(goalId)` |
| `journal.ts` | `agent-state.ts` | `agentState` key-value store for checkpoints | WIRED | Uses `db.select().from(agentState)`, `db.update(agentState)`, `db.insert(agentState)` with `journal:${goalId}` keys |
| `startup-recovery.ts` | `journal.ts` | `readJournal` for recovery state | WIRED | Line 130: `await readJournal(db, goal.id)` |
| `startup-recovery.ts` | `discord.ts` | `sendOperatorDm` on crash recovery | WIRED | Lines 81-85: `await sendOperatorDm(config.discordBotToken, ...)` |
| `agent-loop.ts` | `journal.ts` | `checkpoint(this.db, ...)` after each sub-goal | WIRED | Line 306: `await checkpoint(this.db, goalId, {...})` |
| `index.ts` | `supervisor.ts` | `new Supervisor(...)` + `supervisor.startSupervisorLoop()` | WIRED | Lines 118-127, 160 |
| `scheduler.ts` | BullMQ `Queue.upsertJobScheduler` | Cron recurring jobs | WIRED | Lines 50, 73: `await queue.upsertJobScheduler(...)` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| LOOP-01 | 03-01, 03-02 | Agent sets high-level goals and decomposes into sub-goals with dependencies | SATISFIED | `GoalManager.createGoal` + `decomposeGoal`; FK dependency tracking in `sub_goals.dependsOn` |
| LOOP-02 | 03-02 | Agent executes sub-goals by invoking tools and recording outcomes | SATISFIED | `AgentLoop.executeSubGoal` with `invokeWithKillCheck`; `updateSubGoalStatus` with outcome |
| LOOP-03 | 03-02, 03-05 | Agent evaluates outcomes and triggers replanning when divergent | SATISFIED | `EvaluatorImpl.evaluateOutcome` (metric + LLM); `shouldReplan`; `ReplannerImpl.replan` |
| LOOP-04 | 03-02 | Agent runs continuous planning cycles without human intervention | SATISFIED | `AgentLoop.runContinuousLoop` is an infinite loop; `Supervisor.startSupervisorLoop` runs periodically |
| LOOP-05 | 03-02 | Agent prioritizes sub-goals based on expected value and current capabilities | SATISFIED | `GoalManager.getNextSubGoal` orders by `priority ASC`; `getActiveGoals` orders goals by `priority ASC` |
| MULTI-01 | 03-03 | Main agent can spawn sub-agents for specific tasks concurrently | SATISFIED | `createSpawnAgentTool` enqueues to `agent-tasks` queue; `createAgentWorker` processes jobs |
| MULTI-02 | 03-03 | Sub-agents have isolated LLM context | SATISFIED | `createAgentWorker` creates fresh `messages[]` per job; `buildSubAgentSystemPrompt` scoped context |
| MULTI-03 | 03-03 | Sub-agents report structured results back on completion or failure | SATISFIED | Worker returns `{ success, result/error }` as `job.returnvalue`; `await-agent` retrieves it |
| MULTI-04 | 03-03 | Main agent can monitor and cancel running sub-agents | SATISFIED | `createCancelAgentTool` calls `job.moveToFailed`; `createAwaitAgentTool` polls state |
| MULTI-05 | 03-01, 03-05 | Sub-agents share tool layer and DB, independent LLM sessions | SATISFIED | Shared `router`, `registry`, `db` injected into `createAgentWorker`; isolated `messages[]` |
| MULTI-06 | 03-05 | Main agent decides spawn-vs-inline based on task complexity | SATISFIED | Tool description guides LLM decision; `Supervisor.startSupervisorLoop` comment explains separation of concerns |
| QUEUE-01 | 03-04 | External calls retry with exponential backoff on transient failures | SATISFIED | `createRetryJobOptions` returns `attempts:5, backoff:{type:'exponential',delay:1000}` |
| QUEUE-02 | 03-04 | Exhausted retries move to dead-letter queue for operator review | SATISFIED | `removeOnFail: false` in `createRetryJobOptions`; `UnrecoverableError` skips retries for non-transient |
| QUEUE-03 | 03-04 | Task context fully preserved across retries for deterministic replay | SATISFIED | BullMQ inherently preserves `job.data` in Redis (documented in `retry-config.ts` comment) |
| QUEUE-04 | 03-04 | Scheduled recurring tasks can be enqueued with cron-like timing | SATISFIED | `scheduleRecurringTask` and `scheduleFixedInterval` use `queue.upsertJobScheduler` |
| QUEUE-05 | 03-04 | Long-running tasks execute asynchronously | SATISFIED | `enqueueAsyncTask` returns `jobId`; agent loop does not block; documented architectural decision |
| RECOV-01 | 03-06 | Agent journals each task step result before proceeding to next step | SATISFIED | `checkpoint(this.db, goalId, {...})` called in `runGoalCycle` before next iteration; 3-retry-halt |
| RECOV-02 | 03-06 | On restart, agent replays journal to resume from last checkpoint | SATISFIED | `performStartupRecovery` reads journal, resets in-progress sub-goals, calls `staggeredRestart` |
| RECOV-03 | 03-06 | Agent survives Fly.io machine restarts without losing in-flight work | SATISFIED | Postgres-backed journal + BullMQ Redis survive restarts; `restart: always` policy noted in `index.ts` comment |
| RECOV-04 | 03-06 | Incomplete planning cycles detected and replanned on recovery | SATISFIED | `startup-recovery.ts` queries `planningCycles` for `status='active'`, inserts `status='interrupted'` row |

**All 20 Phase 3 requirements accounted for: SATISFIED.**

No orphaned requirements detected — all IDs in REQUIREMENTS.md traceability table for Phase 3 appear in plan frontmatter and are verified above.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/agent/src/loop/goal-manager.ts` | 71 | `availableTools` hardcoded to empty `[]` in `decomposeGoal` | Warning | LLM goal decomposition cannot reference available tools in its decomposition prompt. The `planGoalDecomposition` prompt will show "(none)" for available tools. This is a known limitation documented inline: "from a no-tools list for now; the concrete tool list is injected at AgentLoop construction time". The agent loop does use the registry for execution — only the decomposition planning prompt is affected. Not a blocker: the LLM can still decompose goals into actionable sub-goals without tool enumeration. |
| `apps/agent/src/worker.ts` | 19-20 | Retry `attempts/backoff` not set as `defaultJobOptions` on Worker itself | Info | Plan-04 said "Add `attempts: 5` and `backoff: { type: 'exponential', delay: 1000 }` to the Worker's `defaultJobOptions`". Worker comment correctly documents that BullMQ `Worker` does not support `defaultJobOptions` (only `Queue` does). Retry options are applied via `createRetryJobOptions()` at enqueue time for `enqueueAsyncTask`. Direct invocations from `AgentLoop` go through `invokeWithKillCheck` (synchronous, not queued), so retry is irrelevant for those. Not a gap for the current architecture. |

---

## Human Verification Required

### 1. End-to-End Goal Execution

**Test:** Insert a row into the `goals` table (`status='active'`, `source='operator-injected'`), start the agent process, observe logs.
**Expected:** Supervisor spawns an AgentLoop for the goal; `decomposeGoal` calls OpenRouter, creates sub-goals in `sub_goals`; `executeSubGoal` iterates LLM tool-calling loop; `checkpoint` entries appear in `agent_state` with key `journal:{goalId}`; goal eventually reaches `status='completed'`.
**Why human:** Requires live OpenRouter API key, Redis, and Postgres to exercise the full LLM + tool-calling runtime path.

### 2. Crash Recovery

**Test:** Start agent with an active goal, kill the process mid-execution while a sub-goal is `in-progress`, restart.
**Expected:** `detectCrashRecovery` returns `true`; Discord DM sent (if tokens configured); in-progress sub-goal reset to `pending`; `staggeredRestart` resumes execution; agent picks up from last journal checkpoint without re-executing completed sub-goals.
**Why human:** Requires coordinated process kill and restart with observable DB state between runs.

### 3. Replan Escalation

**Test:** Configure `maxReplansPerGoal = 2`, inject a goal, force divergence by making tool calls fail repeatedly to accumulate major divergence evaluations.
**Expected:** After 3 replan attempts (exceeding limit of 2), `goals.status` flips to `'paused'`, `goals.pauseReason` is set, Discord DM received by operator, `AgentLoop.runGoalCycle` breaks out of its loop.
**Why human:** Requires live LLM evaluations accumulating divergence results across multiple cycle iterations.

---

## Gaps Summary

No blocking gaps found. All 20 truths verified. All artifacts are substantive (not stubs) and wired correctly.

Two notable observations (neither is a blocker):

1. **Available tools not passed to goal decomposition planner** — `GoalManager.decomposeGoal` passes an empty `availableTools` array to `planGoalDecomposition`. This means the LLM decomposition prompt shows "(none)" for tools. Execution is unaffected since `AgentLoop.executeSubGoal` uses the real `registry` for tool calling. The planner prompt just cannot reference tool names when suggesting sub-goals. This is a documented limitation ("for now") and does not prevent the autonomous loop from functioning.

2. **Worker retry options applied at enqueue not at Worker level** — The tool-execution Worker does not set `defaultJobOptions` for retries (BullMQ Workers do not support this API). Instead, `createRetryJobOptions()` is applied at job-enqueue time via `enqueueAsyncTask`. The `AgentLoop` invokes tools synchronously via `invokeWithKillCheck` (not through the queue), so retry is only relevant for asynchronous tool dispatch via `enqueueAsyncTask`, which does apply the retry options correctly.

---

_Verified: 2026-02-18_
_Verifier: Claude (gsd-verifier)_
