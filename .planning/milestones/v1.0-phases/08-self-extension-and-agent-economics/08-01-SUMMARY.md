---
phase: 08-self-extension-and-agent-economics
plan: 01
subsystem: infra
tags: [esbuild, typescript-compiler, child-process, sandbox, tool-loader, drizzle, postgres]

# Dependency graph
requires:
  - phase: 01-infrastructure
    provides: drizzle schema pattern, pnpm strict isolation pattern
  - phase: 03-autonomous-loop
    provides: ToolRegistry with register/unregister for hot-swap
provides:
  - agent_migrations table in Postgres for audit trail of agent-applied DDL
  - compileTypeScript() — in-memory TS→JS compilation via esbuild.transform
  - runInSandbox() — process-isolated code execution via child_process.fork
  - generateHarnessScript() — child process entry point script generator
  - loadPersistedTools() — startup loader for .mjs files in agent-tools/ directory
affects:
  - 08-02 (schema-tool uses agent_migrations to record DDL)
  - 08-03 (self-extension tool uses compiler + sandbox runner)
  - 08-04 (agent economics startup hook calls loadPersistedTools)

# Tech tracking
tech-stack:
  added:
    - esbuild 0.27.3 (TypeScript in-memory compilation)
    - simple-git 3.31.1 (git operations for future plans)
  patterns:
    - esbuild.transform throws TransformFailure on error — use try/catch, not result.errors check
    - Sandbox harness embedded as generated string in temp .mjs — avoids runtime file resolution of compiled harness
    - fork() + IPC for child process result passing — child.on('message') collects SandboxResult
    - Cache-busting query param on dynamic import for hot-swap: import(`file://${path}?v=${Date.now()}`)

key-files:
  created:
    - packages/db/src/schema/agent-migrations.ts
    - packages/tools/src/self-extension/compiler.ts
    - packages/tools/src/self-extension/sandbox-harness.ts
    - packages/tools/src/self-extension/sandbox-runner.ts
    - packages/tools/src/self-extension/tool-loader.ts
  modified:
    - packages/db/src/schema/index.ts
    - packages/db/drizzle.config.ts
    - packages/tools/package.json

key-decisions:
  - "esbuild.transform throws TransformFailure (not returns errors) — compiler.ts uses try/catch to catch and extract error text from failure.errors[]"
  - "Sandbox harness generated as inline .mjs string via generateHarnessScript() — avoids needing harness to be separately compiled and file-path-resolved at runtime"
  - "runInSandbox() never throws — all outcomes (success, failure, timeout, process error) returned as SandboxResult"
  - "loadPersistedTools() loads only .mjs files (compiled JS) not .ts (source) — .ts kept for agent inspection only"
  - "AGENT_TOOLS_DIR relative to process.cwd() (monorepo root at runtime)"

patterns-established:
  - "Self-extension compilation pipeline: TS source string → esbuild.transform → compiledJs → temp .mjs → fork harness → IPC result"
  - "Tool hot-swap pattern: unregister() first then register() to avoid duplicate name error from registry"

requirements-completed: [EXTEND-01, EXTEND-02, EXTEND-05]

# Metrics
duration: 7min
completed: 2026-02-19
---

# Phase 8 Plan 01: Self-Extension Foundation Summary

**esbuild in-memory TypeScript compiler, child_process.fork sandbox runner, startup tool loader, and agent_migrations Postgres table — three core building blocks for agent self-extension**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-19T05:38:54Z
- **Completed:** 2026-02-19T05:45:47Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created agent_migrations Drizzle schema table with audit trail columns (migrationName unique, sqlExecuted, appliedAt) — applied to Postgres via db:push
- Implemented compileTypeScript() using esbuild.transform for in-memory TS→JS with no disk I/O during compilation
- Implemented runInSandbox() using child_process.fork with IPC result passing, timeout handling, and guaranteed cleanup — never throws to caller
- Implemented generateHarnessScript() that generates a self-contained .mjs harness script, avoiding runtime file resolution issues
- Implemented loadPersistedTools() for startup loading of .mjs files from agent-tools/ with cache-busting and safe hot-swap
- Installed esbuild and simple-git as direct deps to @jarvis/tools (pnpm strict isolation requires explicit deps)

## Task Commits

Each task was committed atomically:

1. **Task 1: agent_migrations schema + install esbuild and simple-git** - `702a707` (feat)
2. **Task 2: TypeScript compiler, sandbox runner, sandbox harness, and tool loader** - `ab6274f` (feat)

**Plan metadata:** _(docs commit hash follows)_

## Files Created/Modified
- `packages/db/src/schema/agent-migrations.ts` - agent_migrations Drizzle table with migrationName (unique), sqlExecuted, appliedAt
- `packages/db/src/schema/index.ts` - Added agent-migrations.js export
- `packages/db/drizzle.config.ts` - Added agent-migrations.ts to schema array
- `packages/tools/package.json` - Added esbuild and simple-git as direct dependencies
- `packages/tools/src/self-extension/compiler.ts` - compileTypeScript() via esbuild.transform, handles TransformFailure
- `packages/tools/src/self-extension/sandbox-harness.ts` - generateHarnessScript() returns complete .mjs string for fork
- `packages/tools/src/self-extension/sandbox-runner.ts` - runInSandbox() forks isolated child, never throws, cleans up temp files
- `packages/tools/src/self-extension/tool-loader.ts` - loadPersistedTools() reads agent-tools/*.mjs with cache-busting

## Decisions Made
- esbuild.transform throws TransformFailure on error (does not return errors in result) — compiler uses try/catch to extract error text from failure.errors[]
- Sandbox harness is generated as an inline string (generateHarnessScript) written to a temp .mjs — avoids needing harness.ts to be separately compiled and resolved at runtime
- runInSandbox() never throws — all outcomes expressed as SandboxResult { passed, output?, error? }
- loadPersistedTools() only loads .mjs (compiled) not .ts (source) — source files are kept for agent inspection and future modification
- AGENT_TOOLS_DIR = process.cwd() + 'agent-tools' — always relative to monorepo root where agent starts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed esbuild compiler to use try/catch instead of result.errors check**
- **Found during:** Task 2 (TypeScript compiler, sandbox runner, sandbox harness, and tool loader)
- **Issue:** Plan specified `if (result.errors.length > 0)` but TransformResult type only has `warnings`, not `errors`. esbuild.transform() throws a TransformFailure (extends Error with .errors[]) on compilation failure rather than returning errors in the result object.
- **Fix:** Wrapped esbuild.transform() call in try/catch; catches err with `'errors' in err` check and casts to TransformFailure to extract error texts
- **Files modified:** packages/tools/src/self-extension/compiler.ts
- **Verification:** `pnpm build --filter @jarvis/tools` passes cleanly after fix
- **Committed in:** ab6274f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — wrong esbuild API usage in plan spec)
**Impact on plan:** Required fix for compilation to work correctly. No scope creep.

## Issues Encountered
- DATABASE_URL env var not set when running `pnpm db:push` — used explicit env prefix `DATABASE_URL=postgres://jarvis:jarvis@localhost:5433/jarvis pnpm db:push` per established 01-01 decision (port 5433)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three building blocks (compiler, sandbox runner, tool loader) are ready for Plans 02-04 to build upon
- agent_migrations table in Postgres with Drizzle schema ready for Plan 02 schema tool
- esbuild and simple-git installed and verified as direct deps
- No blockers for Phase 08 Plans 02-04

## Self-Check: PASSED

All created files verified present on disk. All task commits (702a707, ab6274f) verified in git log.

---
*Phase: 08-self-extension-and-agent-economics*
*Completed: 2026-02-19*
