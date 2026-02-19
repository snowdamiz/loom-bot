---
phase: 02-ai-backbone-and-safety
plan: 02
subsystem: safety
tags: [kill-switch, cli, commander, bullmq, postgres, agent-control]

# Dependency graph
requires:
  - phase: 02-01
    provides: KillSwitchGuard, KillSwitchActiveError, ModelRouter, createRouter from @jarvis/ai

provides:
  - CLI binary (jarvis kill/resume) for operator kill switch control
  - activateKillSwitch/deactivateKillSwitch helper functions in @jarvis/ai
  - invokeWithKillCheck wrapper in @jarvis/tools gating all tool calls with kill switch check
  - BullMQ worker updated to use kill-switch-gated invocation
  - Agent process wired with KillSwitchGuard and ModelRouter at startup

affects: [03-autonomous-planning-loop, 04-wallet-and-payments, 05-web-dashboard]

# Tech tracking
tech-stack:
  added: [commander@12.x]
  patterns:
    - "DB flag pattern for kill switch — CLI writes to agent_state, agent reads; no IPC"
    - "Duck-typed KillCheckable interface in @jarvis/tools — avoids cross-package circular dep"
    - "activateKillSwitch/deactivateKillSwitch shared helpers — DRY for CLI and programmatic use"
    - "invokeWithKillCheck wraps invokeWithLogging — kill gate always applied before any tool exec"

key-files:
  created:
    - apps/cli/package.json
    - apps/cli/tsconfig.json
    - apps/cli/src/index.ts
    - apps/cli/src/commands/kill.ts
    - apps/cli/src/commands/resume.ts
    - packages/tools/src/invoke-safe.ts
  modified:
    - packages/ai/src/kill-switch.ts
    - packages/tools/src/index.ts
    - apps/agent/src/worker.ts
    - apps/agent/src/index.ts
    - apps/agent/package.json

key-decisions:
  - "CLI commands use activateKillSwitch/deactivateKillSwitch helpers from @jarvis/ai rather than inline DB operations — DRY and centralizes the upsert+audit logic"
  - "KillCheckable duck-typed interface in invoke-safe.ts — @jarvis/tools does not depend on @jarvis/ai, keeps dep graph clean"
  - "@jarvis/cli added @jarvis/ai as dependency to access shared helper functions"
  - "Worker creates KillSwitchGuard at module level (shared across all jobs) — single instance with 1s cache for all concurrent BullMQ jobs"

patterns-established:
  - "Kill switch enforcement path: CLI -> DB flag -> KillSwitchGuard.assertActive() -> blocks tool calls and AI calls"
  - "All queued tool execution via BullMQ must go through invokeWithKillCheck (not invokeWithLogging directly)"

requirements-completed: [KILL-01, KILL-03, TOOL-06]

# Metrics
duration: 4min
completed: 2026-02-18
---

# Phase 2 Plan 02: Kill Switch CLI and Tool Gate Summary

**Commander-based CLI (jarvis kill/resume) with DB flag pattern, invokeWithKillCheck gating all BullMQ tool calls, and agent startup wired with KillSwitchGuard and ModelRouter**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T19:14:44Z
- **Completed:** 2026-02-18T19:18:54Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- `apps/cli` binary with `jarvis kill <reason>` and `jarvis resume <reason>` CLI commands backed by Postgres DB flag
- `activateKillSwitch`/`deactivateKillSwitch` helper functions in `@jarvis/ai` kill-switch.ts — eliminate duplicated upsert+audit logic
- `invokeWithKillCheck` in `@jarvis/tools` wraps `invokeWithLogging` with a kill switch pre-check (TOOL-06)
- BullMQ worker updated to use `invokeWithKillCheck` — every queued tool job is kill-switch-gated
- Agent startup wires `KillSwitchGuard` and `ModelRouter` and logs model config to stderr

## Task Commits

Each task was committed atomically:

1. **Task 1: Create apps/cli with kill and resume commands** - `bfaa1ce` (feat)
2. **Task 2: Add kill switch gate, update worker, and wire agent startup** - `9537117` (feat)

**Plan metadata:** (to be committed with SUMMARY.md)

## Files Created/Modified

- `apps/cli/src/index.ts` - Commander entry point with shebang, kill and resume commands
- `apps/cli/src/commands/kill.ts` - `jarvis kill <reason>` command using activateKillSwitch helper
- `apps/cli/src/commands/resume.ts` - `jarvis resume <reason>` command using deactivateKillSwitch helper
- `apps/cli/package.json` - @jarvis/cli binary package with commander, @jarvis/ai, @jarvis/db deps
- `apps/cli/tsconfig.json` - TypeScript config extending @jarvis/typescript-config/base.json
- `packages/ai/src/kill-switch.ts` - Added activateKillSwitch and deactivateKillSwitch export functions
- `packages/tools/src/invoke-safe.ts` - New file: invokeWithKillCheck with KillCheckable duck-type interface
- `packages/tools/src/index.ts` - Added export for invokeWithKillCheck
- `apps/agent/src/worker.ts` - Updated to use invokeWithKillCheck + KillSwitchGuard
- `apps/agent/src/index.ts` - Wires KillSwitchGuard, ModelRouter, loadModelConfig at startup
- `apps/agent/package.json` - Added @jarvis/ai as dependency

## Decisions Made

- CLI commands refactored to use `activateKillSwitch`/`deactivateKillSwitch` from `@jarvis/ai` — originally Task 1 implemented raw DB upsert + audit inline, but Part A of Task 2 specified creating helpers and updating CLI to use them. This is the correct DRY approach.
- `KillCheckable` duck-typed interface in `invoke-safe.ts` — `@jarvis/tools` avoids importing `@jarvis/ai` directly, keeping the dependency graph clean (`tools -> db`, not `tools -> ai -> db`).
- Worker creates `KillSwitchGuard` at module level so the 1-second cache is shared across all 5 concurrent BullMQ job handlers — avoids redundant DB queries under load.

## Deviations from Plan

None - plan executed exactly as written. Task 2 Part A explicitly requested refactoring the CLI commands to use the new helper functions, which was done.

## Issues Encountered

None. All builds passed on first attempt. All DB operations verified against live Postgres container.

## User Setup Required

None - no external service configuration required. The `DATABASE_URL` environment variable is required at runtime (same as all other packages).

## Next Phase Readiness

- Kill switch enforcement is fully wired: operator can halt via `jarvis kill <reason>` and all tool execution via BullMQ is blocked
- `invokeWithKillCheck` is the canonical entry point for tool execution — Phase 3 planning loop must use it
- `ModelRouter` and `KillSwitchGuard` are created at agent startup — Phase 3 planning loop can use the router instance directly
- Phase 3 (Autonomous Planning Loop) can proceed: all safety gates are in place

---
*Phase: 02-ai-backbone-and-safety*
*Completed: 2026-02-18*
