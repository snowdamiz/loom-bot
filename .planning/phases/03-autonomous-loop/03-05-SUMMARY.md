---
phase: 03-autonomous-loop
plan: 05
subsystem: agent-loop
tags: [evaluator, replanner, supervisor, multi-agent, bullmq, divergence-detection, llm-evaluation]

requires:
  - phase: 03-02
    provides: AgentLoop with evaluator/replanner stubs, GoalManager with incrementReplanCount
  - phase: 03-03
    provides: Sub-agent spawn/await/cancel tools, BullMQ agent-tasks worker

provides:
  - "EvaluatorImpl: dual divergence detection (metric triggers + cheap LLM evaluation)"
  - "ReplannerImpl: in-progress work evaluation, goal re-decomposition, operator escalation via Discord DM"
  - "Supervisor: concurrent main agent lifecycle management with staggered restart"
  - "ResultCollector: batched sub-agent result aggregation from BullMQ jobs"
  - "AgentLoop.executeSubGoal: cancellation check at top of each LLM turn"

affects:
  - 03-06
  - 04-wallet

tech-stack:
  added: []
  patterns:
    - "Dual divergence detection: metric fast path fires first (no LLM cost), LLM evaluation only if metrics pass"
    - "Replan limit with operator escalation: goal PAUSED not abandoned, Discord DM alert (non-fatal)"
    - "Supervisor fire-and-forget: goal cycles run in background, errors caught and logged without crashing supervisor"
    - "Staggered restart: spawn one agent per active goal with configurable delay to avoid resource spikes"
    - "ResultCollector parallel polling: all jobIds polled concurrently with 2s sleep between rounds"

key-files:
  created:
    - apps/agent/src/multi-agent/supervisor.ts
    - apps/agent/src/multi-agent/result-collector.ts
  modified:
    - apps/agent/src/loop/evaluator.ts
    - apps/agent/src/loop/replanner.ts
    - apps/agent/src/loop/agent-loop.ts

key-decisions:
  - "EvaluatorImpl reads DISCORD_TOKEN and DISCORD_OPERATOR_USER_ID from env vars — no DB config needed for operator alerts"
  - "shouldReplan accumulation: any major → immediate replan; >2 minor → replan; >50% divergent (min 4 samples) → replan"
  - "Supervisor does not decide spawn-vs-inline — that decision stays at LLM level via tool description (MULTI-06)"
  - "executeSubGoal cancellation returns { success: false, outcome: 'cancelled' } and updates status to 'failed'"
  - "ResultCollector.collectResults polls every 2s; returns timeout error for jobs not completing within timeoutMs"

patterns-established:
  - "Metric-before-LLM evaluation: fast failure detection at zero LLM cost"
  - "Non-fatal operator DM: Discord failures logged to stderr, never interrupt main flow"
  - "Conservative in-progress preservation: if LLM evaluation fails, keep in-progress sub-goal (safe default)"

requirements-completed: [LOOP-03, MULTI-05, MULTI-06]

duration: 4min
completed: 2026-02-18
---

# Phase 03 Plan 05: Evaluator, Replanner, Supervisor, and ResultCollector Summary

**Dual divergence detection with metric-then-LLM evaluation, adaptive goal replanning with operator escalation, and concurrent multi-agent supervision with staggered restart**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T21:18:21Z
- **Completed:** 2026-02-18T21:22:07Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- EvaluatorImpl with two-stage detection: metric triggers (failure outcome, cost threshold) fire first; LLM `cheap` tier evaluates alignment only when metrics pass
- ReplannerImpl with full replan protocol: increment count, check hard limit (5 replans → escalate), evaluate in-progress work via LLM, skip pending sub-goals, re-decompose goal, notify operator via Discord DM
- Supervisor managing concurrent AgentLoop instances with concurrency cap, fire-and-forget goal cycles, periodic reconciliation loop (10s), and staggered restart for crash recovery
- ResultCollector aggregating BullMQ sub-agent job results with parallel polling and configurable timeout
- AgentLoop.executeSubGoal now checks `this.cancelled` at top of each LLM turn for graceful cancellation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create evaluator and replanner** - `e3ee15c` (feat)
2. **Task 2: Create supervisor and result collector, add cancel() to AgentLoop** - `9e71937` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/agent/src/loop/evaluator.ts` - Concrete EvaluatorImpl replacing interface-only stub; dual metric+LLM detection
- `apps/agent/src/loop/replanner.ts` - Concrete ReplannerImpl replacing interface-only stub; replan protocol with escalation
- `apps/agent/src/loop/agent-loop.ts` - Added cancellation check at top of executeSubGoal's LLM turn loop
- `apps/agent/src/multi-agent/supervisor.ts` - Supervisor class managing concurrent main agent lifecycle
- `apps/agent/src/multi-agent/result-collector.ts` - ResultCollector for batched BullMQ job result aggregation

## Decisions Made

- EvaluatorImpl constructor takes optional `{ costThresholdUsd?: number }` config (default $5.00/goal/24h) — simple configurable threshold without DB config table
- shouldReplan uses `evaluations.length >= 4` guard for 50% divergence check to avoid triggering on small sample sizes
- Supervisor passes evaluator and replanner to AgentLoop constructor at spawn time — wires the concrete implementations now that they exist
- Discord DM reads token/userId from env vars (DISCORD_TOKEN, DISCORD_OPERATOR_USER_ID) — consistent with existing discord.ts usage pattern
- ReplannerImpl is named `ReplannerImpl` (class) implementing `Replanner` (interface) — same pattern as EvaluatorImpl/Evaluator to avoid breaking agent-loop.ts imports

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type narrowing for outcome error extraction**
- **Found during:** Task 1 (Evaluator metric trigger implementation)
- **Issue:** `(outcome as { error: unknown }).error` caused TS2352 — object narrowing doesn't allow casting to a type requiring a field that may not exist
- **Fix:** Changed to `(outcome as Record<string, unknown>)['error']` — safe indexed access pattern
- **Files modified:** apps/agent/src/loop/evaluator.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** e3ee15c (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 TypeScript type narrowing bug)
**Impact on plan:** Minor type fix required for correctness. No scope creep.

## Issues Encountered

None — plan executed with one minor TypeScript type narrowing fix caught by the compiler.

## User Setup Required

None - no external service configuration required (Discord env vars for DM alerts are already documented from Phase 02).

## Next Phase Readiness

- Phase 03 Plan 06 (final plan) can now wire everything together into the main entry point
- Evaluator, Replanner, Supervisor, and ResultCollector are all importable and TypeScript-clean
- Full autonomous loop intelligence is complete: goal execution, divergence detection, adaptive replanning, multi-agent management

## Self-Check: PASSED

All created files verified present. Both task commits (e3ee15c, 9e71937) verified in git history.

---
*Phase: 03-autonomous-loop*
*Completed: 2026-02-18*
