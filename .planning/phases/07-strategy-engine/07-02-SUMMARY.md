---
phase: 07-strategy-engine
plan: 02
subsystem: agent-loop
tags: [strategy, agent-loop, supervisor, dashboard, domain-agnostic, prompt-injection]

# Dependency graph
requires:
  - phase: 07-01
    provides: strategies table, StrategyManager class, Strategy type from @jarvis/db
  - phase: 03-autonomous-loop
    provides: AgentLoop, Supervisor, GoalManager
  - phase: 05-web-dashboard
    provides: Hono app with /api prefix and auth middleware

provides:
  - buildPortfolioContextPrompt function injecting domain-agnostic portfolio context into every sub-goal system prompt
  - AgentLoopConfig.strategyContext field for optional per-goal portfolio context injection
  - Supervisor resolves and passes portfolio context to each AgentLoop it spawns
  - StrategyManager wired at agent startup in apps/agent/src/index.ts
  - POST /api/goals dashboard endpoint for operator goal seeding (with optional strategy creation)
  - GET /api/strategies dashboard endpoint returning plain strategy rows

affects:
  - 08-self-extension (agent now receives portfolio context during sub-goal execution)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - systemParts array pattern for dynamic system prompt construction in AgentLoop.executeSubGoal
    - Optional StrategyManager constructor param on Supervisor (backwards compatible)
    - Strategy context resolved per-goal before AgentLoop spawn (not globally)
    - Dashboard API routes follow identities.ts Hono sub-app pattern

key-files:
  created:
    - apps/agent/src/strategy/strategy-prompts.ts  # buildPortfolioContextPrompt builder
    - apps/dashboard/src/routes/api.ts              # POST /goals + GET /strategies
  modified:
    - apps/agent/src/loop/agent-loop.ts             # strategyContext in AgentLoopConfig + executeSubGoal injection
    - apps/agent/src/multi-agent/supervisor.ts      # StrategyManager param + portfolio context resolution
    - apps/agent/src/index.ts                       # StrategyManager instantiation at startup
    - apps/dashboard/src/app.ts                     # apiRoute mount at /api prefix

key-decisions:
  - "systemParts array replaces static join for executeSubGoal system prompt — enables conditional strategy context block between SUB-GOAL and CONSTRAINTS"
  - "Supervisor resolves strategy context per-goal (not globally) — only strategy-backed goals receive portfolio context; plain goals unaffected"
  - "buildPortfolioContextPrompt is domain-agnostic: status + hypothesis only, hypothesis truncated to 80 chars, lastTransitionReason shown only for paused/killed"
  - "StrategyManager is optional param on Supervisor (not required) — Supervisor works without it for non-strategy goals"
  - "Dashboard api.ts uses direct db inserts (not GoalManager) — dashboard cannot import from apps/agent without circular dep; direct @jarvis/db is correct pattern"

patterns-established:
  - "Portfolio context injection: buildPortfolioContextPrompt → strategyContext string → AgentLoopConfig → system prompt injection"
  - "Per-goal context resolution: getStrategyByGoalId check before spawnMainAgent → fetch all strategies only when strategy exists"

requirements-completed: [STRAT-01, STRAT-02, STRAT-04, STRAT-05, STRAT-08]

# Metrics
duration: 3min
completed: 2026-02-19
---

# Phase 7 Plan 02: Strategy Engine Integration Summary

**Domain-agnostic portfolio context injected into every sub-goal system prompt via buildPortfolioContextPrompt, StrategyManager wired at agent startup, and operator goal-seeding API added to dashboard**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-19T03:31:43Z
- **Completed:** 2026-02-19T03:34:38Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created `strategy-prompts.ts` with `buildPortfolioContextPrompt(Strategy[]): string` — compact domain-agnostic listing with status and hypothesis only
- Empty strategies array → directive prompt to discover opportunities using available tools
- Non-empty strategies → numbered list with STATUS: "hypothesis" (truncated 80 chars), Goal #N, Since date, and lastTransitionReason for paused/killed states only
- Added `strategyContext?: string` to `AgentLoopConfig` — backwards compatible optional field
- `AgentLoop.executeSubGoal()` uses `systemParts` array pattern: injects strategy context between SUB-GOAL and CONSTRAINTS when `strategyContext` is defined
- Supervisor accepts optional `StrategyManager` param; `spawnMainAgent()` resolves strategy context per-goal before creating AgentLoop
- `StrategyManager` instantiated at agent startup in `index.ts`, passed to Supervisor
- Created dashboard `api.ts`: `POST /goals` seeds operator goal + optional strategy, `GET /strategies` returns plain rows
- Mounted `apiRoute` at `/api` prefix in `app.ts` — `POST /api/goals` and `GET /api/strategies` are reachable
- All three packages compile clean: `@jarvis/db`, `@jarvis/agent`, `@jarvis/dashboard`
- `evaluator.ts` NOT modified (per plan constraint)
- Zero domain-specific data in the portfolio prompt

## Task Commits

Each task was committed atomically:

1. **Task 1: Create portfolio prompt builder and inject strategy context into agent loop** - `c2b7025` (feat)
2. **Task 2: Wire StrategyManager into supervisor and agent startup, add goal-seeding API** - `66852d2` (feat)

## Files Created/Modified

- `apps/agent/src/strategy/strategy-prompts.ts` — created: buildPortfolioContextPrompt with domain-agnostic output
- `apps/agent/src/loop/agent-loop.ts` — modified: strategyContext in AgentLoopConfig, systemParts injection in executeSubGoal
- `apps/agent/src/multi-agent/supervisor.ts` — modified: optional StrategyManager param, per-goal strategy context resolution in spawnMainAgent
- `apps/agent/src/index.ts` — modified: StrategyManager import and instantiation, passed to Supervisor
- `apps/dashboard/src/routes/api.ts` — created: POST /goals and GET /strategies Hono routes
- `apps/dashboard/src/app.ts` — modified: apiRoute import and mount at /api prefix

## Decisions Made

- `systemParts` array pattern chosen over string concatenation for executeSubGoal system prompt — enables conditional blocks without string interpolation gymnastics
- Strategy context resolved per-goal inside `spawnMainAgent()` (not once globally) — ensures each spawned loop gets fresh portfolio state at spawn time
- `buildPortfolioContextPrompt` shows `lastTransitionReason` only for paused/killed strategies — reduces prompt tokens for active strategies while providing context for stalled ones
- Dashboard `api.ts` uses direct `@jarvis/db` imports (not GoalManager) — avoids cross-app dependency; direct DB inserts follow the same pattern used across all dashboard routes

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — both builds succeeded on first attempt.

## User Setup Required

None.

## Next Phase Readiness

- Phase 7 complete: strategies table in Postgres, StrategyManager CRUD, portfolio context injected into every sub-goal prompt, operator can seed goals via dashboard
- Phase 8 (self-extension) can rely on strategy.metadata jsonb for domain-specific context accumulation
- No blockers

---
*Phase: 07-strategy-engine*
*Completed: 2026-02-19*

## Self-Check: PASSED

- apps/agent/src/strategy/strategy-prompts.ts: FOUND
- apps/agent/src/loop/agent-loop.ts: FOUND
- apps/agent/src/multi-agent/supervisor.ts: FOUND
- apps/agent/src/index.ts: FOUND
- apps/dashboard/src/routes/api.ts: FOUND
- apps/dashboard/src/app.ts: FOUND
- .planning/phases/07-strategy-engine/07-02-SUMMARY.md: FOUND
- Commit c2b7025: FOUND
- Commit 66852d2: FOUND
