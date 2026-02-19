---
phase: 03-autonomous-loop
plan: 06
subsystem: infra
tags: [crash-recovery, journal, checkpointing, postgres, bullmq, autonomous-loop]

# Dependency graph
requires:
  - phase: 03-02
    provides: AgentLoop with runGoalCycle and executeSubGoal wired
  - phase: 03-04
    provides: BullMQ queue/worker patterns and retry utilities
  - phase: 03-05
    provides: Supervisor, EvaluatorImpl, ReplannerImpl implementations

provides:
  - Journal checkpoint system (checkpoint/readJournal/clearJournal/getCompletedSubGoalIds)
  - Startup crash recovery (detectCrashRecovery/performStartupRecovery)
  - Full Phase 3 autonomous loop wired into agent process entry point
  - Graceful shutdown of all Phase 3 resources (supervisor, sub-agent worker, queues)

affects:
  - 04-wallet
  - future phases using the agent process as a foundation

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "3-retry mandatory checkpoint write with halt-on-failure — prevents uncheckpointed progress (Pitfall 3)"
    - "LOG-05 two-row pattern for interrupted planning cycles — insert interrupted row, never update active row"
    - "Duck-typed ShutdownSupervisor interface — shutdown.ts decoupled from concrete Supervisor class"

key-files:
  created:
    - apps/agent/src/recovery/journal.ts
    - apps/agent/src/recovery/startup-recovery.ts
  modified:
    - apps/agent/src/loop/agent-loop.ts
    - apps/agent/src/index.ts
    - apps/agent/src/shutdown.ts

key-decisions:
  - "Journal checkpoint must succeed before next sub-goal — 3 retries then halt (not silent skip)"
  - "clearJournal called on goal completion to prevent stale journal affecting future recovery"
  - "LOG-05 two-row pattern for interrupted planning cycles: insert completion row with status=interrupted"
  - "ShutdownSupervisor duck-typed interface in shutdown.ts — avoids importing concrete Supervisor (decoupling)"
  - "Sub-agent tools (spawn/await/cancel) registered in registry after creation, before Supervisor instantiation"

patterns-established:
  - "Journal key format: journal:{goalId} in agent_state table"
  - "Recovery sequence: detect → Discord DM → mark cycles interrupted → reset in-progress sub-goals → staggered restart"
  - "RECOV-03: Fly.io restart:always + Postgres journal + BullMQ Redis = durable recovery"

requirements-completed: [RECOV-01, RECOV-02, RECOV-03, RECOV-04]

# Metrics
duration: 4min
completed: 2026-02-18
---

# Phase 3 Plan 06: Crash Recovery and Full Autonomous Loop Wiring Summary

**Postgres-backed journal checkpointing with 3-retry halt semantics, startup crash recovery with Discord DM alerts, and full Phase 3 autonomous loop wired into the agent process entry point**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T21:25:45Z
- **Completed:** 2026-02-18T21:29:06Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Journal system writes checkpoints to agent_state after each sub-goal with mandatory success (RECOV-01)
- Startup recovery detects interrupted work, sends Discord DM, marks cycles interrupted (LOG-05), resets sub-goals to pending, and triggers staggered supervisor restart (RECOV-02, RECOV-04)
- Agent process entry point now bootstraps the complete Phase 3 stack: GoalManager, EvaluatorImpl, ReplannerImpl, Supervisor, sub-agent worker, agent-tasks queue, crash recovery, and graceful shutdown of all components

## Task Commits

Each task was committed atomically:

1. **Task 1: Create journal checkpoint system and wire into AgentLoop** - `8b5e2cc` (feat)
2. **Task 2: Create startup recovery module** - `610ff17` (feat)
3. **Task 3: Wire full autonomous loop into agent process entry point** - `40ca4e3` (feat)

**Plan metadata:** (docs commit - see below)

## Files Created/Modified

- `apps/agent/src/recovery/journal.ts` - Journal checkpoint system: checkpoint/readJournal/clearJournal/getCompletedSubGoalIds backed by agent_state table
- `apps/agent/src/recovery/startup-recovery.ts` - Startup crash recovery: detectCrashRecovery, performStartupRecovery with Discord DM, LOG-05 cycle marking, sub-goal reset, staggered restart
- `apps/agent/src/loop/agent-loop.ts` - Wired checkpoint() after each sub-goal in runGoalCycle; clearJournal() on goal completion
- `apps/agent/src/index.ts` - Full Phase 3 bootstrap: sub-agent tools registered, GoalManager/Evaluator/Replanner/Supervisor created, crash recovery run, supervisor loop started
- `apps/agent/src/shutdown.ts` - Added ShutdownSupervisor interface, supervisor/agentWorker/agentTasksQueue shutdown in gracefulShutdown

## Decisions Made

- Journal checkpoint uses 3-retry mandatory success pattern — if all 3 attempts fail, throws error halting the agent loop for that goal (prevents uncheckpointed progress causing duplicate execution on recovery)
- clearJournal() called when goal completes to prevent stale journal from affecting future recovery runs
- LOG-05 two-row pattern applied to interrupted planning cycles: insert new row with status='interrupted', never update the original 'active' row
- ShutdownSupervisor is a duck-typed interface in shutdown.ts — avoids importing the concrete Supervisor class, keeping shutdown.ts decoupled
- Sub-agent tools registered before creating Supervisor so openAITools includes spawn/await/cancel tools

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

All 5 files verified present. All 3 task commits verified in git history.

## Next Phase Readiness

- Phase 3 is fully complete. The agent process bootstraps the complete autonomous loop on startup.
- Phase 4 (Wallet) can build on the running agent infrastructure: GoalManager for wallet goals, Supervisor for managing wallet strategy loops, journal for crash recovery of in-flight transactions.
- Concern: Phase 4 wallet signing service architecture flagged in research as needing deeper research during planning.

---
*Phase: 03-autonomous-loop*
*Completed: 2026-02-18*
