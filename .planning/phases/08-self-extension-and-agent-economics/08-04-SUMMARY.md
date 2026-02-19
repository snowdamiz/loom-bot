---
phase: 08-self-extension-and-agent-economics
plan: "04"
subsystem: self-extension
tags: [bullmq, agent-startup, worker-sync, tool-registry, onToolChange, reload-tools, loadPersistedTools]

# Dependency graph
requires:
  - phase: 08-01
    provides: loadPersistedTools, AGENT_TOOLS_DIR, compileTypeScript, runInSandbox
  - phase: 08-02
    provides: createSchemaExtendTool
  - phase: 08-03
    provides: createSelfExtensionTools, createToolWriteTool, createToolDeleteTool
provides:
  - Agent process loads persisted agent-authored tools from disk on startup (loadPersistedTools)
  - Agent process registers all 3 self-extension tools (tool_write, tool_delete, schema_extend) with LLM visibility
  - reload-tools BullMQ Queue in agent process — enqueued on tool_write/tool_delete success via onToolChange callback
  - Worker process loads persisted tools at startup and reloads on reload-tools BullMQ job
  - Shutdown handler closes reload-tools queue cleanly on SIGTERM/SIGINT
  - createToolWriteTool/createToolDeleteTool accept optional onToolChange callback (backward compatible)
affects:
  - Phase 8 complete — all self-extension capabilities now operational end-to-end

# Tech tracking
tech-stack:
  added: []
  patterns:
    - onToolChange optional callback pattern for fire-and-forget worker sync after tool mutations
    - BullMQ Queue('reload-tools') in agent + Worker('reload-tools') in worker for cross-process registry sync
    - Non-blocking loadPersistedTools at worker startup via .then()/.catch() — worker accepts jobs immediately
    - Phase-ordered bootstrap in agent index.ts with openAITools re-derived after each phase

key-files:
  created: []
  modified:
    - apps/agent/src/index.ts
    - apps/agent/src/worker.ts
    - apps/agent/src/shutdown.ts
    - packages/tools/src/self-extension/tool-writer.ts
    - packages/tools/src/self-extension/index.ts

key-decisions:
  - "onToolChange optional callback on createToolWriteTool/createToolDeleteTool/createSelfExtensionTools — backward compatible (no breaking change), passes BullMQ enqueue function from agent without @jarvis/tools depending on bullmq"
  - "loadPersistedTools in worker uses non-blocking .then()/.catch() — worker can accept jobs immediately, persisted tools load in parallel (not blocking startup)"
  - "reload-tools BullMQ Worker concurrency 1, removeOnComplete age 60s — reload jobs are transient notifications, not long-term records needing DLQ"
  - "reloadToolsQueue added to ShutdownResources as optional field with { close(): Promise<void> } — consistent with agentTasksQueue duck-typing pattern"

patterns-established:
  - "Cross-process tool sync: agent enqueues BullMQ job on tool mutation, worker re-runs loadPersistedTools on receipt"
  - "Optional callback injection for side effects: tool factories accept onToolChange without requiring bullmq dep in @jarvis/tools"

requirements-completed: [EXTEND-03, EXTEND-05]

# Metrics
duration: 2min
completed: 2026-02-19
---

# Phase 8 Plan 04: Agent and Worker Phase 8 Wiring Summary

**End-to-end self-extension operational: agent loads persisted tools on startup, registers tool_write/tool_delete/schema_extend with the LLM, and syncs the worker process via BullMQ reload-tools queue on every tool mutation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-19T05:54:14Z
- **Completed:** 2026-02-19T05:56:35Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Agent process now loads all agent-authored tools from `agent-tools/` disk on startup via `loadPersistedTools(registry)` before the supervisor loop begins
- All 3 self-extension tools (tool_write, tool_delete, schema_extend) registered with `createSelfExtensionTools(registry, onToolChange)` — LLM sees them via re-derived openAITools
- reload-tools BullMQ Queue created in agent; `onToolChange` callback enqueues a job when tool_write/tool_delete succeeds, notifying the worker
- Worker process loads persisted tools at startup (non-blocking), and handles `reload-tools` BullMQ jobs via a second `reloadWorker` with concurrency 1
- Graceful shutdown cleanly closes the reload-tools queue (added to ShutdownResources)
- Final agent log line updated from "Phase 4 ready" to "All phases ready"

## Task Commits

Each task was committed atomically:

1. **Task 1: Agent process Phase 8 bootstrap** - `44c0046` (feat)
2. **Task 2: Worker process tool loading and reload-tools sync** - `cc90c8c` (feat)

**Plan metadata:** `(pending)` (docs: complete plan)

## Files Created/Modified
- `apps/agent/src/index.ts` — Phase 8 bootstrap block: loadPersistedTools, reload-tools Queue, createSelfExtensionTools with onToolChange, openAITools re-derive, updated shutdown call
- `apps/agent/src/worker.ts` — loadPersistedTools at startup (non-blocking), reloadWorker on 'reload-tools' queue
- `apps/agent/src/shutdown.ts` — reloadToolsQueue field in ShutdownResources, close in gracefulShutdown at step 5.5
- `packages/tools/src/self-extension/tool-writer.ts` — createToolWriteTool/createToolDeleteTool accept optional onToolChange?: () => void, call onToolChange?.() after successful mutations
- `packages/tools/src/self-extension/index.ts` — createSelfExtensionTools accepts optional onToolChange, passes through to createToolWriteTool and createToolDeleteTool

## Decisions Made
- `onToolChange` is optional callback (not required) — backward compatible, keeps @jarvis/tools free of bullmq dependency; callers inject the enqueue function from outside
- Worker uses `.then().catch()` instead of `await` for `loadPersistedTools` — worker.ts is module-level code (no async IIFE), non-blocking startup is intentional
- `removeOnComplete: { age: 60 }` on reload-tools worker — reload jobs are transient notifications; short TTL prevents Redis bloat without DLQ concerns (not a tool execution job)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated createSelfExtensionTools and tool factories before Task 1 build**
- **Found during:** Task 1 (agent build after adding Phase 8 bootstrap)
- **Issue:** `createSelfExtensionTools(registry, onToolChange)` call in index.ts caused TS2554 "Expected 1 arguments, but got 2" because the factory signature only accepted `registry`
- **Fix:** Updated `createToolWriteTool`, `createToolDeleteTool`, and `createSelfExtensionTools` to accept optional `onToolChange?: () => void` parameter; the `onToolChange?.()` calls were added at success points in both tool execute() functions (which is also the Task 2 requirement for those files)
- **Files modified:** `packages/tools/src/self-extension/tool-writer.ts`, `packages/tools/src/self-extension/index.ts`
- **Verification:** `pnpm build --filter @jarvis/tools` passes; `pnpm build --filter @jarvis/agent` passes
- **Committed in:** 44c0046 (Task 1 commit — per plan, these file changes were planned for Task 2 but blocked Task 1 compilation)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking)
**Impact on plan:** Task 2 tool-factory changes were pulled forward into Task 1 commit because they were required for Task 1 to compile. No scope creep — all changes were explicitly specified in the plan.

## Issues Encountered
- The plan separated Task 1 (index.ts changes) and Task 2 (tool-writer.ts changes), but Task 1's call to `createSelfExtensionTools(registry, onToolChange)` required the Task 2 signature update first. Resolved by updating the factories in the Task 1 commit.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 8 is fully complete — all 4 plans done
- The agent is end-to-end self-extensible: tool_write compiles, sandbox-tests, persists, and hot-swaps tools; worker is notified via BullMQ reload-tools
- schema_extend creates agent_* tables and adds columns to core tables
- Built-in tools modifiable via git branch staging (stageBuiltinChange)
- All capabilities survive process restarts (loadPersistedTools loads from disk on startup in both processes)
- Full workspace build passes (10/10 tasks, 9 cached)

## Self-Check: PASSED

All files present and all commits verified.

---
*Phase: 08-self-extension-and-agent-economics*
*Completed: 2026-02-19*
