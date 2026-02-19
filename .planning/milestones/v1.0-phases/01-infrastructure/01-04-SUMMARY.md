---
phase: 01-infrastructure
plan: 04
subsystem: agent
tags: [bullmq, dotenv, agent-process, worker, memory-consolidation, graceful-shutdown, drizzle-orm]

# Dependency graph
requires:
  - phase: 01-03
    provides: "createDefaultRegistry(db), invokeWithLogging(), ToolRegistry, redis export from @jarvis/tools, DbClient from @jarvis/db"
  - phase: 01-02
    provides: "@jarvis/logging logCycleStart, Redis session layer, @jarvis/db pool export"
  - phase: 01-01
    provides: "@jarvis/db with agentState, memoryFacts, toolCalls schemas, Postgres/Redis Docker infrastructure"
provides:
  - "apps/agent/src/index.ts: main process — createDefaultRegistry (4 tools), BullMQ Queue, startConsolidation, registerShutdownHandlers, writes system:status to agent_state (DATA-01)"
  - "apps/agent/src/worker.ts: BullMQ Worker on tool-execution queue, concurrency 5, delegates to invokeWithLogging (DATA-03 working memory)"
  - "apps/agent/src/shutdown.ts: registerShutdownHandlers({pool, redis, worker?, consolidation?}) — SIGTERM/SIGINT, 10s force-kill, closes all connections"
  - "apps/agent/src/memory-consolidation.ts: startConsolidation/stopConsolidation, consolidate() writes structured facts to memory_facts (DATA-06)"
  - "packages/db/src/index.ts: re-exports eq, and, or, desc, asc, gt, gte, lt, lte, isNull, isNotNull from drizzle-orm"
affects: [02-agent-core, 03-tool-primitives, 06-orchestration, 08-self-extension]

# Tech tracking
tech-stack:
  added:
    - bullmq@5.34.8 (BullMQ queue/worker for async tool execution dispatch)
    - dotenv@16.4.7 (environment variable loading at process startup)
  patterns:
    - "ShutdownResources interface uses duck-typing interfaces (ShutdownPool, ShutdownRedis) to avoid importing ioredis/pg directly in apps/agent — pnpm strict isolation"
    - "Memory consolidation is idempotent via agent_state key='memory:last_consolidation' tracking ISO timestamp of last run"
    - "Facts are permanent: no DELETE statements — isStale boolean only"
    - "Graceful shutdown order: consolidation interval -> BullMQ worker -> Redis quit -> pool.end() -> exit(0)"
    - "drizzle-orm operators re-exported from @jarvis/db (eq, and, or, gt, etc.) so downstream apps don't need direct drizzle-orm dep"

key-files:
  created:
    - apps/agent/package.json
    - apps/agent/tsconfig.json
    - apps/agent/src/index.ts
    - apps/agent/src/worker.ts
    - apps/agent/src/shutdown.ts
    - apps/agent/src/memory-consolidation.ts
  modified:
    - packages/db/src/index.ts (added eq, and, or, desc, asc, gt, gte, lt, lte, isNull, isNotNull re-exports)
    - pnpm-lock.yaml (bullmq, dotenv)

key-decisions:
  - "ShutdownPool/ShutdownRedis duck-typing interfaces instead of importing ioredis/pg types directly — apps/agent has bullmq as direct dep but not ioredis or pg; duck-typing satisfies the contract"
  - "drizzle-orm operators (eq, and, gt, etc.) re-exported from @jarvis/db — follows the pattern established in 01-03 (sql re-export) for pnpm strict isolation"
  - "Memory consolidation grouping strategy: success rows in tool_calls have toolName='completion' (two-row pattern); resolve actual tool name by joining to parent started row via parentId"
  - "consolidate() runs immediately at startup (not just on interval) to pick up any results from previous agent runs before this restart"

patterns-established:
  - "Shutdown protocol: always stop intervals first (prevents new writes), then drain workers, then quit Redis, then pool.end() — order matters for clean drain"
  - "Agent process stays alive via open connections (Redis/Postgres pool) — no explicit keep-alive loop needed; connections hold the event loop"
  - "Memory fact permanence: data pipeline facts are append-only like audit logs — isStale=true for superseded but row never deleted"

requirements-completed: [DATA-03, DATA-06]

# Metrics
duration: 5min
completed: 2026-02-18
---

# Phase 1 Plan 04: Agent Process, Worker, Memory Consolidation, and Graceful Shutdown Summary

**apps/agent with main process (4 tools, BullMQ queue, system:status to Postgres), BullMQ worker (concurrency 5, invokeWithLogging), memory consolidation (5-min periodic, idempotent, permanent facts), and SIGTERM/SIGINT graceful shutdown (10s force-kill timeout)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-18T17:58:36Z
- **Completed:** 2026-02-18T18:03:50Z
- **Tasks:** 2 of 2
- **Files modified:** 8

## Accomplishments

- Main agent process starts, connects to Postgres + Redis, creates ToolRegistry with 4 tools (shell/http/file/db), writes system:status to agent_state — DATA-01 end-to-end verified
- BullMQ worker starts and listens for tool-execution jobs, delegates to invokeWithLogging (full logging + truncation protection)
- Memory consolidation runs immediately at startup and every 5 minutes: 7 facts created from 14 existing success rows across 7 tool types; second run confirms idempotency ("No new tool results")
- Graceful shutdown on SIGTERM: stops consolidation interval, disconnects Redis (QUIT), ends Postgres pool (drain), exits 0 — verified with node binary and live connections

## Task Commits

Each task was committed atomically:

1. **Task 1: Create main agent process with tool registry and BullMQ worker** - `65e9c4b` (feat)
2. **Task 2: Implement memory consolidation periodic job** - `4dae6cb` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `apps/agent/package.json` - @jarvis/agent package with bullmq, dotenv deps and tsx dev scripts
- `apps/agent/tsconfig.json` - Extends @jarvis/typescript-config/base.json, outDir=dist, rootDir=src
- `apps/agent/src/index.ts` - Main process: createDefaultRegistry (4 tools), Queue, startConsolidation, registerShutdownHandlers, upserts system:status to agent_state
- `apps/agent/src/worker.ts` - BullMQ Worker on 'tool-execution', concurrency 5, removeOnComplete/Fail, delegates to invokeWithLogging
- `apps/agent/src/shutdown.ts` - registerShutdownHandlers with ShutdownPool/ShutdownRedis interfaces; SIGTERM/SIGINT; 10s force-kill; clearInterval -> worker.close() -> redis.quit() -> pool.end()
- `apps/agent/src/memory-consolidation.ts` - startConsolidation/stopConsolidation, consolidate() with timestamp-tracked idempotency, parent-join for actual tool names, permanent fact insertion
- `packages/db/src/index.ts` - Added re-exports: eq, and, or, desc, asc, gt, gte, lt, lte, isNull, isNotNull from drizzle-orm

## Decisions Made

- **ShutdownPool/ShutdownRedis duck-typing**: apps/agent doesn't have ioredis or pg as direct deps (pnpm strict isolation). Created minimal interface contracts `{ end(): Promise<void> }` and `{ quit(): Promise<string> }` that the actual Pool and Redis instances satisfy structurally. This avoids needing to add ioredis/pg as direct deps just for types.
- **drizzle-orm operators re-exported from @jarvis/db**: Consistent with the `sql` re-export established in Plan 01. apps/agent needs `eq` and `gt` for agent_state queries but can't import drizzle-orm directly. Added a full set of common operators to @jarvis/db's barrel export.
- **Memory consolidation uses parent-join strategy**: The two-row append-only pattern stores toolName='completion' on success rows. To get the real tool name, consolidate() fetches all started rows and builds a parentId->toolName map, then joins success rows via parentId.
- **Immediate first run for consolidation**: consolidate(db) is called once before setInterval to process any tool results from previous agent runs (before this restart). Otherwise there would be a 5-minute gap at every restart.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Agent build failed: cannot import ioredis/pg directly in apps/agent**
- **Found during:** Task 1 (first tsc build attempt)
- **Issue:** shutdown.ts had `import type { Redis } from 'ioredis'` and `import type { Pool } from 'pg'` — neither is a direct dep of apps/agent under pnpm strict isolation. TypeScript error TS2307.
- **Fix:** Created structural interface contracts `ShutdownPool { end(): Promise<void> }` and `ShutdownRedis { quit(): Promise<string> }` instead of importing the concrete types.
- **Files modified:** apps/agent/src/shutdown.ts
- **Verification:** pnpm --filter @jarvis/agent run build exits 0
- **Committed in:** 65e9c4b (Task 1 commit)

**2. [Rule 3 - Blocking] Agent build failed: cannot import drizzle-orm directly for `eq`**
- **Found during:** Task 1 (first tsc build attempt — `import { eq } from 'drizzle-orm'` in index.ts)
- **Issue:** apps/agent doesn't have drizzle-orm as a direct dep. TypeScript error TS2307. Needed `eq` for agent_state upsert queries.
- **Fix:** Added drizzle-orm operator re-exports to packages/db/src/index.ts (eq, and, or, desc, asc, gt, gte, lt, lte, isNull, isNotNull). Imported from @jarvis/db instead.
- **Files modified:** packages/db/src/index.ts, apps/agent/src/index.ts
- **Verification:** pnpm --filter @jarvis/db run build + pnpm --filter @jarvis/agent run build both exit 0
- **Committed in:** 65e9c4b (Task 1 commit)

**3. [Rule 1 - Bug] Unused `NodeJS` import from 'node:timers' (invalid export)**
- **Found during:** Task 1 (first tsc build attempt)
- **Issue:** `import type { NodeJS } from 'node:timers'` — NodeJS namespace is not exported from node:timers. TS2305 error.
- **Fix:** Removed the import. Used `ReturnType<typeof setInterval>` (inferred from global) for the interval type.
- **Files modified:** apps/agent/src/shutdown.ts
- **Verification:** pnpm --filter @jarvis/agent run build exits 0
- **Committed in:** 65e9c4b (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking pnpm isolation issues, 1 TypeScript bug)
**Impact on plan:** All auto-fixes necessary for compilation under pnpm strict isolation. No scope creep. Pattern of re-exporting from @jarvis/db is consistent with prior decisions (Plan 01 established sql re-export, now extended to drizzle operators).

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - all infrastructure runs locally via Docker Compose. apps/agent uses DATABASE_URL=postgres://jarvis:jarvis@localhost:5433/jarvis and REDIS_URL=redis://localhost:6379 from .env.example.

## Next Phase Readiness

- Phase 1 infrastructure is complete and operational: Postgres + Redis + @jarvis/db + @jarvis/logging + @jarvis/tools + @jarvis/agent all verified end-to-end
- agent_state table operational for persistent state (DATA-01)
- memory_facts table operational with structured facts from consolidation (DATA-06)
- Working memory documented as LLM context window (DATA-03 — no implementation, by design)
- tool_calls table (LOG-02, LOG-04, LOG-05) verified operational from Plan 03
- All Phase 1 requirements satisfied; Phase 2 (Agent Core) can begin

## Self-Check: PASSED

All files verified present on disk. All task commits verified in git log.

- FOUND: apps/agent/package.json
- FOUND: apps/agent/tsconfig.json
- FOUND: apps/agent/src/index.ts
- FOUND: apps/agent/src/worker.ts
- FOUND: apps/agent/src/shutdown.ts
- FOUND: apps/agent/src/memory-consolidation.ts
- FOUND: packages/db/src/index.ts (modified)
- COMMIT 65e9c4b: feat(01-04): create main agent process, BullMQ worker, and graceful shutdown
- COMMIT 4dae6cb: feat(01-04): implement memory consolidation periodic job (DATA-06)

---
*Phase: 01-infrastructure*
*Completed: 2026-02-18*
