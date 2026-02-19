---
phase: 07-strategy-engine
plan: 01
subsystem: database
tags: [postgres, drizzle-orm, strategy, goals, domain-agnostic]

# Dependency graph
requires:
  - phase: 03-autonomous-loop
    provides: GoalManager class and goals table — StrategyManager depends on goalManager.createGoal()
  - phase: 01-infrastructure
    provides: @jarvis/db package with DrizzleORM, DbClient type, re-exported operators
provides:
  - strategies Postgres table with lifecycle state, goalId FK, hypothesis text, metadata jsonb
  - Strategy and NewStrategy TypeScript types exported from @jarvis/db
  - StrategyManager class with domain-agnostic CRUD and lifecycle transitions
affects:
  - 07-02-strategy-engine (plan 02 wires StrategyManager into AgentLoop)
  - 08-self-extension (agent can store domain data in strategy.metadata)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Co-locate strategy table in goals.ts to avoid drizzle-kit CJS .js resolution failure (same as subGoals pattern)
    - strategies.ts as re-export shim for backward compatibility
    - sql template for operators not re-exported from @jarvis/db (!=, NOT IN)
    - jsonb merge via coalesce+|| pattern for non-destructive metadata updates

key-files:
  created:
    - packages/db/src/schema/strategies.ts  # re-export shim
    - apps/agent/src/strategy/strategy-manager.ts  # domain-agnostic strategy CRUD
  modified:
    - packages/db/src/schema/goals.ts  # strategies table co-located here
    - packages/db/src/schema/index.ts  # export * from strategies.js added
    - packages/db/drizzle.config.ts    # strategies.ts removed (table is in goals.ts)

key-decisions:
  - "strategies table co-located in goals.ts: drizzle-kit CJS bundler cannot resolve cross-file .js imports back to .ts — same pattern as subGoals"
  - "strategies.ts is a re-export shim (follows sub-goals.ts pattern) — maintains clean import surface"
  - "sql template for != and NOT IN operators — not and notInArray not re-exported from @jarvis/db"
  - "metadata jsonb merge uses coalesce(existing, '{}'::jsonb) || new::jsonb — non-destructive, preserves prior agent context"
  - "strategy engine is domain-agnostic: no financial columns, all domain data in metadata jsonb"

patterns-established:
  - "StrategyManager mirrors GoalManager constructor pattern: (db: DbClient, dependency)"
  - "Lifecycle transitions: direct UPDATE on strategies (living registry, not append-only)"
  - "All lifecycle decisions deferred to LLM — StrategyManager provides only CRUD primitives"

requirements-completed: [STRAT-03, STRAT-06]

# Metrics
duration: 3min
completed: 2026-02-19
---

# Phase 7 Plan 01: Strategy Data Model and StrategyManager Summary

**Domain-agnostic strategies Postgres table with goalId FK, lifecycle state machine, and StrategyManager CRUD class using metadata jsonb for all domain-specific context**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-19T03:25:05Z
- **Completed:** 2026-02-19T03:28:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created strategies Postgres table with 8 columns: id, goalId (FK to goals), hypothesis, status (default 'hypothesis'), lastTransitionReason, metadata jsonb, createdAt, updatedAt
- Strategy and NewStrategy types exported from @jarvis/db — fully accessible via import { strategies, Strategy, NewStrategy } from '@jarvis/db'
- StrategyManager class with all 6 methods: createStrategy, transitionStatus, updateMetadata, getStrategies, getStrategyByGoalId, getActiveStrategies
- Zero domain-specific columns on the table; zero domain-specific logic in StrategyManager
- Both @jarvis/db and @jarvis/agent build clean with no TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create strategies table, export from index, register in drizzle config** - `01d8095` (feat)
2. **Task 2: Create StrategyManager with domain-agnostic CRUD and lifecycle transitions** - `504fbc4` (feat)

## Files Created/Modified
- `packages/db/src/schema/goals.ts` - strategies pgTable co-located here (drizzle-kit CJS bundler requirement)
- `packages/db/src/schema/strategies.ts` - re-export shim following sub-goals.ts pattern
- `packages/db/src/schema/index.ts` - added export * from './strategies.js' after goals.js
- `packages/db/drizzle.config.ts` - strategies.ts removed (table is in goals.ts, already covered)
- `apps/agent/src/strategy/strategy-manager.ts` - domain-agnostic strategy CRUD and lifecycle transitions

## Decisions Made
- Co-located strategies table definition inside goals.ts: drizzle-kit's CJS bundler cannot resolve cross-file .js imports back to .ts source files — the established project pattern (subGoals in goals.ts, sub-goals.ts shim) was applied to strategies
- sql template operator used for != and NOT IN: these operators are not re-exported from @jarvis/db; using sql`${strategies.status} != 'killed'` and sql`${strategies.status} NOT IN ('killed', 'completed')` avoids the pnpm strict isolation constraint
- jsonb merge pattern: `coalesce(${strategies.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb` — preserves existing metadata keys, agent can call updateMetadata multiple times without losing prior context

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] strategies.ts cross-file FK import breaks drizzle-kit db:push**
- **Found during:** Task 1 verification (db:push attempt)
- **Issue:** Original strategies.ts imported `goals` from `./goals.js`. drizzle-kit CJS bundler at runtime cannot resolve `.js` extension back to `.ts` source — `Cannot find module './goals.js'` error
- **Fix:** Co-located strategies table definition inside goals.ts (same pattern as subGoals), converted strategies.ts to a re-export shim, removed strategies.ts from drizzle.config.ts (goals.ts already covers it)
- **Files modified:** packages/db/src/schema/goals.ts, packages/db/src/schema/strategies.ts, packages/db/drizzle.config.ts
- **Verification:** db:push ran cleanly, strategies table confirmed in Postgres with all 8 correct columns
- **Committed in:** 01d8095 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Required fix — without it db:push fails and the table cannot be created. Follows established project pattern, no scope creep.

## Issues Encountered
- drizzle-kit CJS bundler limitation on cross-file .js imports is a recurring project constraint. Applied the established sub-goals.ts pattern immediately upon discovering the failure.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- strategies table in Postgres, GoalId FK confirmed, all types exported from @jarvis/db
- StrategyManager class ready for wiring into AgentLoop in plan 07-02
- No blockers — both @jarvis/db and @jarvis/agent build clean

---
*Phase: 07-strategy-engine*
*Completed: 2026-02-19*

## Self-Check: PASSED

- packages/db/src/schema/goals.ts: FOUND
- packages/db/src/schema/strategies.ts: FOUND
- packages/db/src/schema/index.ts: FOUND
- apps/agent/src/strategy/strategy-manager.ts: FOUND
- .planning/phases/07-strategy-engine/07-01-SUMMARY.md: FOUND
- Commit 01d8095: FOUND
- Commit 504fbc4: FOUND
