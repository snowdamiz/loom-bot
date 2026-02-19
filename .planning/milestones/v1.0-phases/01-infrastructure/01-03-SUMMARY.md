---
phase: 01-infrastructure
plan: 03
subsystem: tools
tags: [tool-registry, shell, http, got, tough-cookie, file, postgres, zod, abort-controller, timeout, invocation-logging]

# Dependency graph
requires:
  - phase: 01-02
    provides: "@jarvis/logging (logToolStart/logToolComplete/logToolFailure), @jarvis/tools Redis session layer, DbClient type from @jarvis/db"
provides:
  - "ToolRegistry with register/unregister/get/has/list/count (extensible for Phase 8 self-extension)"
  - "ToolDefinition<TInput,TOutput> interface with zod inputSchema and AbortSignal"
  - "ToolResult<T> with success, output, error, durationMs, truncated fields"
  - "withTimeout(toolName, fn, ms) enforcing configurable limits via AbortController (TOOL-07)"
  - "ToolTimeoutError class with timeoutMs property and descriptive error message"
  - "invokeWithLogging() — single entry point: pre-log (TOOL-05), full output to Postgres (LOG-02), never throws"
  - "shellTool: child_process.spawn execution returning stdout/stderr/exitCode (TOOL-01)"
  - "httpTool: got v14 with CookieJar, redirect following, throwHttpErrors:false, parsedBody (TOOL-02)"
  - "fileTool: read/write/append/delete/exists/list with streaming for files >5MB (TOOL-03)"
  - "createDbTool(db): arbitrary SQL via sql.raw() including DDL (TOOL-04, DATA-02)"
  - "createDefaultRegistry(db): convenience factory with all 4 tools pre-registered"
affects: [02-agent-core, 06-orchestration, 08-self-extension]

# Tech tracking
tech-stack:
  added:
    - got@14.6.6 (HTTP client with CookieJar and AbortSignal support)
    - tough-cookie@5.1.2 (CookieJar for persistent cookies across requests)
  patterns:
    - "ToolDefinition uses ZodType<TInput, ZodTypeDef, unknown> — the third generic param avoids ZodDefault _input variance error in strict mode"
    - "createReadStream is from node:fs, not node:fs/promises — streaming file reads use sync stream API"
    - "DB tool uses createDbTool(db) factory pattern — injects DbClient at registry creation time, no extra pool"
    - "Truncation is two-output: full output always logged to Postgres, ToolResult truncated only after logging"
    - "invokeWithLogging never throws — all failures returned as ToolResult { success: false, error }"

key-files:
  created:
    - packages/tools/src/types.ts
    - packages/tools/src/timeout.ts
    - packages/tools/src/registry.ts
    - packages/tools/src/invoke.ts
    - packages/tools/src/shell/index.ts
    - packages/tools/src/http/index.ts
    - packages/tools/src/file/index.ts
    - packages/tools/src/db-tool/index.ts
  modified:
    - packages/tools/src/index.ts (expanded from Redis-only to full tool exports + createDefaultRegistry)
    - packages/tools/src/types.ts (ZodType third generic param fix)
    - packages/tools/package.json (added got, tough-cookie)
    - pnpm-lock.yaml (got@14.6.6, tough-cookie@5.1.2)

key-decisions:
  - "ZodType<TInput, ZodTypeDef, unknown> for inputSchema — the third param (TInput to schema) as unknown allows ZodDefault optional fields without _input variance errors in TypeScript strict mode"
  - "createDbTool(db) factory instead of module-level dbTool singleton — DB tool requires DbClient injection, which isn't available at module load time"
  - "sql from @jarvis/db (not drizzle-orm directly) — pnpm strict isolation prevents transitive imports; @jarvis/db re-exports sql from drizzle-orm"
  - "createReadStream from node:fs not node:fs/promises — fs/promises has no createReadStream export"
  - "shell: false always in spawn — security; even in unrestricted mode, agent generates commands programmatically so shell injection vector from shell: true is avoided"

patterns-established:
  - "Invocation protocol: look up tool → validate input (zod) → logToolStart → withTimeout(execute) → logToolComplete/logToolFailure → apply truncation to ToolResult"
  - "Full output logged first, truncation applied second — these are two distinct outputs that must never be conflated"
  - "invokeWithLogging never throws — callers receive ToolResult always; Postgres errors on logging are written to stderr and do not fail invocation"

requirements-completed: [TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-07]

# Metrics
duration: 8min
completed: 2026-02-18
---

# Phase 1 Plan 03: Tool Registry and Four Tool Implementations Summary

**ToolRegistry + ToolDefinition interface + withTimeout/AbortController + invokeWithLogging (pre-log, full output, no-throw) + shell/HTTP/file/DB query tools verified against live Postgres and httpbin.org**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-18T17:45:26Z
- **Completed:** 2026-02-18T17:53:47Z
- **Tasks:** 2 of 2
- **Files modified:** 12

## Accomplishments

- ToolRegistry, ToolDefinition, ToolResult, withTimeout, ToolTimeoutError, and invokeWithLogging all compile and pass live verification
- 22/22 verification assertions passed: shell echo, shell timeout (150ms kills sleep 10), HTTP GET 200, file write/read/delete cycle, DB SELECT + DDL CREATE/DROP, tool_calls log linkage (parentId), registry list/count/register
- Truncation verified: large output (200 chars) logged full to Postgres tool_calls.output while ToolResult.output is 50 chars with truncated:true
- createDefaultRegistry(db) returns registry with all 4 tools pre-registered; used by apps/agent at startup

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tool registry, types, timeout wrapper, and invocation layer** - `abb67bf` (feat)
2. **Task 2: Implement shell, HTTP, file, and DB query tools** - `3910cee` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `packages/tools/src/types.ts` - ToolDefinition<TInput,TOutput> interface and ToolResult<T> type
- `packages/tools/src/timeout.ts` - withTimeout() + ToolTimeoutError with AbortController (TOOL-07)
- `packages/tools/src/registry.ts` - ToolRegistry: register/unregister/get/has/list/count
- `packages/tools/src/invoke.ts` - invokeWithLogging(): TOOL-05 pre-log, LOG-02 full output, truncation post-log
- `packages/tools/src/shell/index.ts` - shellTool: spawn(shell:false), AbortSignal, stdout/stderr/exitCode (TOOL-01)
- `packages/tools/src/http/index.ts` - httpTool: got v14 + CookieJar + throwHttpErrors:false (TOOL-02)
- `packages/tools/src/file/index.ts` - fileTool: read/write/append/delete/exists/list, streaming >5MB (TOOL-03)
- `packages/tools/src/db-tool/index.ts` - createDbTool(db): sql.raw() for arbitrary SQL + DDL (TOOL-04)
- `packages/tools/src/index.ts` - Updated: all exports + createDefaultRegistry(db)
- `packages/tools/package.json` - Added got@14.6.6, tough-cookie@5.1.2
- `pnpm-lock.yaml` - Updated with new dependencies

## Decisions Made

- **ZodType third generic param**: `inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>` — needed because `ZodDefault._input` is `T | undefined` but `_output` is `T`. Setting the schema input type to `unknown` allows ZodDefault fields to be assigned without TypeScript variance errors.
- **createDbTool(db) factory pattern**: DB tool needs DbClient at instantiation time (not module load time). Factory closed over the injected db instance avoids module-level singleton that would require process.env at import time.
- **sql from @jarvis/db**: pnpm strict isolation — @jarvis/tools can't import drizzle-orm transitively. @jarvis/db already re-exports `sql` (added in Plan 01), so that's the correct import.
- **shell: false always**: Even in unrestricted mode, agent generates structured commands (command + args array). shell: true would create unnecessary shell injection vectors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ZodType generic variance error with ZodDefault fields**
- **Found during:** Task 2 (pnpm --filter @jarvis/tools run build)
- **Issue:** `inputSchema: z.ZodType<TInput>` caused TS2322 because `ZodDefault<ZodOptional<T>>._input` is `T | undefined` but `_output` is `T` — TypeScript sees the schema's input type as wider than TInput
- **Fix:** Changed to `z.ZodType<TInput, z.ZodTypeDef, unknown>` — setting the raw input type to `unknown` allows any zod schema (including those with defaults) to be assigned
- **Files modified:** packages/tools/src/types.ts
- **Verification:** pnpm --filter @jarvis/tools run build exits 0
- **Committed in:** 3910cee (Task 2 commit)

**2. [Rule 1 - Bug] createReadStream from wrong fs module**
- **Found during:** Task 2 (pnpm --filter @jarvis/tools run build)
- **Issue:** `import { createReadStream } from 'node:fs/promises'` caused TS2305 "Module has no exported member" — createReadStream is in `node:fs`, not `node:fs/promises`
- **Fix:** Changed import to `import { createReadStream } from 'node:fs'`
- **Files modified:** packages/tools/src/file/index.ts
- **Verification:** pnpm --filter @jarvis/tools run build exits 0
- **Committed in:** 3910cee (Task 2 commit)

**3. [Rule 3 - Blocking] drizzle-orm not accessible from @jarvis/tools — used @jarvis/db re-export**
- **Found during:** Task 2 implementation
- **Issue:** `import { sql } from 'drizzle-orm'` would fail at runtime under pnpm strict isolation — @jarvis/tools does not have drizzle-orm as a direct dep and cannot import transitively
- **Fix:** Changed to `import { sql } from '@jarvis/db'` — @jarvis/db already re-exports `sql` from drizzle-orm (established in Plan 01)
- **Files modified:** packages/tools/src/db-tool/index.ts
- **Verification:** pnpm --filter @jarvis/tools run build exits 0, DB tool verified against live Postgres
- **Committed in:** 3910cee (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 TypeScript strict mode bugs, 1 blocking import)
**Impact on plan:** All auto-fixes necessary for compilation. No scope creep. Patterns align with prior decisions (DbClient via @jarvis/db, not drizzle-orm direct).

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - all tools run against local Docker Compose infrastructure (Postgres on 5433, Redis on 6379). HTTP tool tested against httpbin.org (public, no credentials required).

## Next Phase Readiness

- @jarvis/tools package complete: ToolRegistry, 4 registered tools, timeout enforcement, automatic logging integration
- createDefaultRegistry(db) ready for apps/agent to call at startup
- invokeWithLogging() is the single entry point ensuring TOOL-05 (pre-log) and LOG-02 (full output) on every tool call
- Both Postgres (tool_calls table) and Redis (session layer) storage tiers verified operational
- Plan 04 can begin: agent core using these tool primitives

## Self-Check: PASSED

All files verified present on disk. All task commits verified in git log.

- FOUND: packages/tools/src/types.ts
- FOUND: packages/tools/src/timeout.ts
- FOUND: packages/tools/src/registry.ts
- FOUND: packages/tools/src/invoke.ts
- FOUND: packages/tools/src/shell/index.ts
- FOUND: packages/tools/src/http/index.ts
- FOUND: packages/tools/src/file/index.ts
- FOUND: packages/tools/src/db-tool/index.ts
- FOUND: packages/tools/src/index.ts
- COMMIT abb67bf: feat(01-03): implement tool registry, types, timeout wrapper, and invocation layer
- COMMIT 3910cee: feat(01-03): implement shell, HTTP, file, and DB query tools + createDefaultRegistry

---
*Phase: 01-infrastructure*
*Completed: 2026-02-18*
