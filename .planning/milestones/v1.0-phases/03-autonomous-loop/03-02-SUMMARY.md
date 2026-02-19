---
phase: 03-autonomous-loop
plan: 02
subsystem: agent, planning
tags: [goal-management, llm-planning, tool-calling, autonomous-loop, drizzle, openai, bullmq]

# Dependency graph
requires:
  - phase: 03-autonomous-loop
    plan: 01
    provides: goals/sub_goals tables, ModelRouter.completeWithTools, toolDefinitionsToOpenAI

provides:
  - GoalManager class (create, decompose via LLM, track, query goals and sub-goals)
  - planGoalDecomposition function (LLM goal decomposition with anti-over-decomposition prompt)
  - planNextAction function (LLM action plan text for sub-goal context)
  - AgentLoop class (executeSubGoal tool-calling loop, runGoalCycle, runContinuousLoop)
  - Evaluator interface (for Plan 05 concrete implementation)
  - Replanner interface (for Plan 05 concrete implementation)

affects: [03-03-tool-invocation-loop, 03-04-agent-worker, 03-05-supervisor, 03-06-orchestrator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ToolCompletionRequest type extraction pattern: use ToolCompletionRequest['messages'][number] to get ChatCompletionMessageParam without direct openai import"
    - "Fresh messages array per sub-goal: each executeSubGoal call starts with a clean slate — no LLM context leakage between sub-goals"
    - "Two-pass sub-goal insert: first pass creates rows to get IDs, second pass resolves 0-based index dependsOn references to actual DB IDs"
    - "Interface stubs for evaluator/replanner: define types in plan 02, fill concrete impl in plan 05 — avoids forward dependency"

key-files:
  created:
    - apps/agent/src/loop/goal-manager.ts
    - apps/agent/src/loop/planner.ts
    - apps/agent/src/loop/agent-loop.ts
    - apps/agent/src/loop/evaluator.ts
    - apps/agent/src/loop/replanner.ts
  modified:
    - apps/agent/src/multi-agent/agent-worker.ts

key-decisions:
  - "ChatCompletionMessageParam extracted from ToolCompletionRequest['messages'][number] — avoids direct openai import in @jarvis/agent (pnpm strict isolation)"
  - "Evaluator and Replanner defined as interface stubs in loop/ — concrete implementations in Plan 05 slot in via optional constructor params"
  - "GoalManager.decomposeGoal uses 2-pass insert for dependsOn resolution — first pass gets IDs, second pass patches resolved IDs into dependsOn arrays"
  - "planGoalDecomposition strips markdown fences from LLM response — models often add ``` despite explicit instructions not to"
  - "AgentLoop cancellation via this.cancelled flag — cooperative cancellation without AbortSignal to keep the interface simple"

patterns-established:
  - "Pattern: extracting openai types via ToolCompletionRequest['messages'][number] for packages that depend on @jarvis/ai but not openai directly"
  - "Pattern: two-pass DB insert for self-referential arrays (insert all rows, then update references using returned IDs)"

requirements-completed: [LOOP-01, LOOP-02, LOOP-03, LOOP-04, LOOP-05]

# Metrics
duration: 6min
completed: 2026-02-18
---

# Phase 3 Plan 2: Autonomous Loop Core Summary

**GoalManager with LLM decomposition, dependency-aware sub-goal scheduling, and AgentLoop tool-calling cycle with continuous goal processing and optional evaluator/replanner wiring**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-18T21:08:32Z
- **Completed:** 2026-02-18T21:14:34Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- GoalManager manages full goal lifecycle: createGoal, decomposeGoal via LLM with 2-pass ID resolution, getActiveGoals, getSubGoals, getNextSubGoal (dependency+priority ordering), updateSubGoalStatus, updateGoalStatus, incrementReplanCount, isGoalComplete
- planner.ts provides planGoalDecomposition (strong tier, anti-over-decomposition prompt) and planNextAction (mid tier action planning text)
- AgentLoop executes sub-goals through full OpenAI tool-calling protocol: fresh messages array, assistant message before tool results, all finish_reason branches (stop/tool_calls/length/content_filter), max turns guard
- runGoalCycle: dependency-aware sub-goal selection with optional evaluator/replanner LOOP-03 wiring, LOG-03 cycle logging
- runContinuousLoop (LOOP-04): infinite priority-ordered goal processing with cancellation support

## Task Commits

Each task was committed atomically:

1. **Task 1: Create GoalManager and LLM planner** - `0a5e691` (feat)
2. **Task 2: Create the agentic tool-calling loop** - `58bcfbd` (feat)

## Files Created/Modified
- `apps/agent/src/loop/goal-manager.ts` - Goal lifecycle management with LLM-driven decomposition and dependency-aware scheduling
- `apps/agent/src/loop/planner.ts` - LLM planning functions: planGoalDecomposition (strong tier) and planNextAction (mid tier)
- `apps/agent/src/loop/agent-loop.ts` - Core tool-calling loop: executeSubGoal, runGoalCycle, runContinuousLoop with evaluator/replanner wiring
- `apps/agent/src/loop/evaluator.ts` - Evaluator/EvaluationResult interfaces (concrete impl in Plan 05)
- `apps/agent/src/loop/replanner.ts` - Replanner/ReplanResult interfaces (concrete impl in Plan 05)
- `apps/agent/src/multi-agent/agent-worker.ts` - Fixed direct openai import and removeOnFail type errors (Rule 1 auto-fix)

## Decisions Made
- ChatCompletionMessageParam/Tool types extracted from `ToolCompletionRequest['messages'][number]` and `ToolCompletionRequest['tools'][number]` — avoids direct openai package dependency in @jarvis/agent under pnpm strict isolation
- GoalManager.decomposeGoal uses a 2-pass insert: first insert all sub-goals to get their DB IDs, then update dependsOn arrays with resolved IDs (0-based planner indices → actual DB IDs)
- planGoalDecomposition strips markdown fences from LLM response as a safety measure — models add ``` despite explicit instructions not to
- Evaluator and Replanner defined as interface stubs now so AgentLoop can reference them via optional constructor params; Plan 05 fills in the concrete classes
- AgentLoop.cancel() sets a boolean flag for cooperative cancellation rather than using AbortSignal — simpler interface sufficient for the loop use case

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed direct openai import in agent-worker.ts**
- **Found during:** Task 2 (creating agent-loop.ts, which surfaced the same import pattern issue)
- **Issue:** `apps/agent/src/multi-agent/agent-worker.ts` imported `ChatCompletionMessageParam` and `ChatCompletionTool` directly from `openai/resources/chat/completions` — @jarvis/agent has no direct openai dep under pnpm strict isolation, causing TS2307
- **Fix:** Replaced with type extraction from `ToolCompletionRequest['messages'][number]` and `ToolCompletionRequest['tools'][number]` from @jarvis/ai
- **Files modified:** `apps/agent/src/multi-agent/agent-worker.ts`
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** `58bcfbd` (Task 2 commit)

**2. [Rule 1 - Bug] Removed removeOnFail: false from agent-worker.ts WorkerOptions**
- **Found during:** Task 2 TypeScript check
- **Issue:** BullMQ `WorkerOptions.removeOnFail` only accepts `KeepJobs | undefined`, not `boolean`. `false` causes TS2322 type error
- **Fix:** Removed `removeOnFail: false` — BullMQ default is to keep all failed jobs in the DLQ (same semantic intent)
- **Files modified:** `apps/agent/src/multi-agent/agent-worker.ts`
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** `58bcfbd` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 - Bug)
**Impact on plan:** Both fixes necessary for TypeScript correctness under pnpm strict isolation. No scope creep — agent-worker.ts had pre-existing type errors that blocked compilation verification.

## Issues Encountered
None beyond the auto-fixed type errors documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GoalManager ready for use by Supervisor (Plan 05) and any operator tooling
- AgentLoop ready for Supervisor wiring with concrete Evaluator/Replanner in Plan 05
- planGoalDecomposition can be called by Supervisor with the full ToolRegistry.list() for accurate tool context
- evaluator.ts and replanner.ts interfaces are the exact types AgentLoop expects — Plan 05 concrete classes must implement these interfaces

---
*Phase: 03-autonomous-loop*
*Completed: 2026-02-18*

## Self-Check: PASSED

All created files verified on disk. All task commits verified in git log.
- FOUND: apps/agent/src/loop/goal-manager.ts
- FOUND: apps/agent/src/loop/planner.ts
- FOUND: apps/agent/src/loop/agent-loop.ts
- FOUND: apps/agent/src/loop/evaluator.ts
- FOUND: apps/agent/src/loop/replanner.ts
- FOUND: .planning/phases/03-autonomous-loop/03-02-SUMMARY.md
- FOUND: 0a5e691 (Task 1 commit — GoalManager and planner)
- FOUND: 58bcfbd (Task 2 commit — AgentLoop, evaluator/replanner stubs, agent-worker fixes)
