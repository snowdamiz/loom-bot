---
phase: 13-promotion-guardrails-rollback-and-visibility
plan: 02
subsystem: self-extension
tags: [rollback, known-good-baseline, health-monitor, fail-closed, observability]
requires:
  - phase: 13-01
    provides: lifecycle event + promotion control primitives
provides:
  - post-promotion health monitor with persisted loop-heartbeat evaluation
  - known-good baseline and promoted_pending_health pipeline state lifecycle
  - automated rollback controller with cooldown/idempotency guards and GitHub rollback pipeline
affects: [phase-13-dashboard-visibility, builtin-modify, agent-runtime-recovery]
tech-stack:
  added: []
  patterns:
    - health/rollback orchestration driven from persisted agent_state snapshots
    - baseline advancement deferred until health-window pass signal
    - rollback controller routes recovery through deterministic GitHub branch/PR/merge primitives
key-files:
  created:
    - .planning/phases/13-promotion-guardrails-rollback-and-visibility/13-02-SUMMARY.md
    - apps/agent/src/recovery/self-extension-health.ts
    - packages/tools/src/self-extension/rollback-controller.ts
  modified:
    - apps/agent/src/index.ts
    - apps/agent/src/multi-agent/supervisor.ts
    - apps/agent/src/shutdown.ts
    - packages/tools/src/index.ts
    - packages/tools/src/self-extension/github-pipeline.ts
    - packages/tools/src/self-extension/index.ts
    - packages/tools/src/self-extension/staging-deployer.ts
    - packages/tools/src/self-extension/tool-writer.ts
key-decisions:
  - "Promotion now writes promoted_pending_health state with previousBaselineSha and blocks new promotions while pending/failed rollback health states remain unresolved."
  - "Supervisor loop emits persisted system:loop_health heartbeat records used as deterministic rollback-health signal input."
  - "Rollback execution uses a dedicated controller with persisted cooldown/idempotency guards before running GitHub rollback branch/PR/merge operations."
patterns-established:
  - "Health monitor emits health_window_passed/health_window_failed lifecycle events and triggers automated rollback on deadline-expired degraded health."
  - "Builtin modify responses now carry rollback metadata fields for operator and autonomous recovery reasoning."
requirements-completed: [SEXT-13, SEXT-14]
duration: 6 min
completed: 2026-02-20
---

# Phase 13 Plan 02: Known-good baseline + automated rollback Summary

**Phase 13 rollback core is implemented: promoted changes now enter a health-window lifecycle, baseline advancement is gated on health pass, and degraded health can trigger deterministic automated rollback with append-only audit events.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-20T00:50:30Z
- **Completed:** 2026-02-20T00:56:52Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Added supervisor heartbeat persistence to `system:loop_health` and a startup-wired self-extension health monitor.
- Added promoted-pending-health pipeline state model in GitHub promotion flow:
  - blocks new promotions when health/rollback states are unresolved,
  - records prior baseline metadata,
  - defers baseline advancement until health pass signal.
- Added `runGitHubRollbackPipeline` and `runAutomatedRollback` orchestration:
  - resolves rollback target baseline,
  - runs deterministic rollback branch/PR/merge,
  - persists rollback status with cooldown/idempotency guards,
  - emits rollback lifecycle events.
- Added health-window lifecycle event emission (`health_window_passed`, `health_window_failed`).
- Extended staging + builtin `tool_write` contracts with rollback fields (`rollbackAttempted`, `rollbackStatus`, `rollbackReason`, `rollbackTargetBaselineSha`, `rollbackRunId`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Health telemetry + monitoring entrypoint in agent runtime** - `8267d58` (feat)
2. **Task 2: Rollback controller + baseline lifecycle orchestration** - `23b645a` (feat)
3. **Task 3: Rollback visibility fields + health-window event surfacing** - `89aec0b` (feat)

## Verification

Executed and passed:
- `pnpm --filter @jarvis/tools build`
- `pnpm --filter @jarvis/agent build`
- `rg -n "system:loop_health|startSelfExtensionHealthMonitor|health window" apps/agent/src/recovery/self-extension-health.ts apps/agent/src/multi-agent/supervisor.ts apps/agent/src/index.ts`
- `rg -n "runAutomatedRollback|known_good_baseline|promoted_pending_health|rollback_started|rolled_back" packages/tools/src/self-extension/rollback-controller.ts packages/tools/src/self-extension/github-pipeline.ts`
- `rg -n "rollback|baseline|event" packages/tools/src/self-extension/staging-deployer.ts packages/tools/src/self-extension/tool-writer.ts`

Not executed in this environment:
- Manual smoke for degraded health simulation with live GitHub credentials and real rollback branch/PR merge.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- Plan 03 can now consume persisted pipeline/baseline/rollback status and promotion control fields for dashboard/API/SSE surfaces.
- Operator-visible self-extension health views and pause controls can be built on stable response contracts and lifecycle event taxonomy.

---
*Phase: 13-promotion-guardrails-rollback-and-visibility*
*Completed: 2026-02-20*
