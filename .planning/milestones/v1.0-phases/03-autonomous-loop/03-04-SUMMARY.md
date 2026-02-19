---
phase: 03-autonomous-loop
plan: 04
subsystem: queue
tags: [bullmq, redis, retry, exponential-backoff, dlq, cron, scheduler, async]

# Dependency graph
requires:
  - phase: 03-01
    provides: goals/sub_goals schema, completeWithTools, toolDefinitionsToOpenAI
  - phase: 02-02
    provides: Worker with invokeWithKillCheck, KillSwitchGuard

provides:
  - BullMQ retry configuration with exponential backoff (QUEUE-01)
  - Dead-letter queue preservation via removeOnFail: false (QUEUE-02)
  - Documented job.data immutability across retries (QUEUE-03)
  - Cron-based recurring task scheduling via upsertJobScheduler (QUEUE-04)
  - Async long-running task dispatch pattern (QUEUE-05)

affects:
  - 03-05-autonomous-planning
  - 03-06-multi-agent

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UnrecoverableError for non-transient failures — skips retry attempts, moves to DLQ immediately"
    - "isTransientError() classifier — network/rate-limit/5xx retry, client-4xx/validation/kill-switch skip"
    - "wrapWithTransientCheck() wrapper — enforces transient classification at call site"
    - "upsertJobScheduler() for idempotent cron registration — safe to call on every startup"
    - "enqueueAsyncTask() returns jobId — agent enqueues and moves on, never blocks on result"

key-files:
  created:
    - apps/agent/src/queue/retry-config.ts
    - apps/agent/src/queue/scheduler.ts
  modified:
    - apps/agent/src/worker.ts

key-decisions:
  - "BullMQ WorkerOptions does not accept defaultJobOptions or removeOnFail: false — retry options (attempts/backoff) set per-job via createRetryJobOptions(); worker-level removeOnFail omitted (BullMQ default keeps all failed jobs)"
  - "isTransientError() is conservative — unknown errors return false (no retry) to avoid infinite retry loops on unexpected failures"
  - "upsertJobScheduler() is idempotent — same schedulerId updates schedule in place, safe to call at every agent startup without duplicating schedules"
  - "listSchedules() filters schedulers with null/undefined id via type-guard — BullMQ getJobSchedulers() can return schedulers with null id in some edge cases"

patterns-established:
  - "Retry config factory: createRetryJobOptions(overrides?) — single source for attempts/backoff/removeOnFail across all job enqueue sites"
  - "Transient error classification: isTransientError(err) — centralizes retry/no-retry decision, prevents scatter-gun exception handling"
  - "Scheduler idempotence: scheduleRecurringTask(queue, id, cron, data) — call on startup to register or update without duplication"

requirements-completed: [QUEUE-01, QUEUE-02, QUEUE-03, QUEUE-04, QUEUE-05]

# Metrics
duration: 3min
completed: 2026-02-18
---

# Phase 3 Plan 04: Queue Hardening (Retry, DLQ, Scheduler) Summary

**BullMQ queue hardened with exponential backoff retry (5 attempts), dead-letter queue via removeOnFail: false, cron/interval scheduler helpers using upsertJobScheduler, and async task dispatch pattern**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-18T21:08:39Z
- **Completed:** 2026-02-18T21:11:45Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 updated)

## Accomplishments

- Created `retry-config.ts` with three exports: `createRetryJobOptions()`, `isTransientError()`, `wrapWithTransientCheck()` — fully typed retry and DLQ configuration
- Updated `worker.ts` with `UnrecoverableError` for non-transient failures, `isTransientError()` import, and `removeOnFail` omitted (BullMQ default = keep all failed jobs)
- Created `scheduler.ts` with five exports: `scheduleRecurringTask()`, `scheduleFixedInterval()`, `removeSchedule()`, `listSchedules()`, `enqueueAsyncTask()` — complete recurring task lifecycle
- Monorepo builds cleanly (`npx turbo build` 6/6 tasks successful)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create retry configuration and DLQ support** - `891f8c3` (feat)
2. **Task 2: Create scheduled/recurring task support and async task helpers** - `b128cdf` (feat)

**Plan metadata:** `(pending)` (docs: complete plan)

## Files Created/Modified

- `apps/agent/src/queue/retry-config.ts` — Job options factory with exponential backoff, DLQ preservation (removeOnFail: false), transient error classifier, and wrapWithTransientCheck() wrapper
- `apps/agent/src/queue/scheduler.ts` — Cron/interval recurring task scheduling, schedule listing/removal, and async task enqueue helpers
- `apps/agent/src/worker.ts` — Updated with UnrecoverableError, isTransientError import, and corrected removeOnFail behavior

## Decisions Made

- **BullMQ WorkerOptions limitation:** `defaultJobOptions` and `removeOnFail: false` (boolean) are not accepted at the Worker level — only `KeepJobs` objects. Retry options (`attempts`/`backoff`) must be set per-job via `createRetryJobOptions()`. Worker `removeOnFail` is omitted to use BullMQ's default (keep all failed jobs). This achieves identical behavior to `removeOnFail: false`.
- **Conservative isTransientError():** Unknown error types return `false` (no retry). This prevents infinite retry loops on unexpected failures. Only explicitly known transient patterns (network errors, 429, 5xx, timeouts) return `true`.
- **upsertJobScheduler idempotence:** The scheduler ID is a stable key — calling `scheduleRecurringTask()` on the same ID on every startup updates rather than duplicates. This eliminates the need for "schedule exists" checks.
- **listSchedules() type-guard:** `queue.getJobSchedulers()` can return schedulers with `null | undefined` IDs in some BullMQ edge cases. Added a filter type-guard to enforce `id: string` in the return type.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed defaultJobOptions not supported by BullMQ WorkerOptions**
- **Found during:** Task 1 (Create retry configuration and DLQ support)
- **Issue:** Plan specified `defaultJobOptions: { attempts: 5, backoff: ..., removeOnFail: false }` in Worker constructor, but BullMQ's `WorkerOptions` interface does not include `defaultJobOptions`. TS2353 error. The `removeOnFail` field on `WorkerOptions` only accepts `KeepJobs` (not boolean).
- **Fix:** Removed `defaultJobOptions` wrapper — `removeOnComplete` moved to Worker level directly. `attempts`/`backoff` will be set per-job via `createRetryJobOptions()` when using `enqueueAsyncTask()`. Worker-level `removeOnFail` omitted (BullMQ default behavior = keep all failed jobs).
- **Files modified:** `apps/agent/src/worker.ts`
- **Verification:** `npx tsc --noEmit` clean for worker.ts and queue/*.ts
- **Committed in:** 891f8c3 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed type incompatibility in listSchedules() return type**
- **Found during:** Task 2 (Create scheduled/recurring task support)
- **Issue:** `queue.getJobSchedulers()` returns `id: string | null | undefined`, but return type declared `id: string`. TS2322 error.
- **Fix:** Added `.filter((s): s is typeof s & { id: string } => typeof s.id === 'string')` type-guard before mapping.
- **Files modified:** `apps/agent/src/queue/scheduler.ts`
- **Verification:** `npx tsc --noEmit` clean
- **Committed in:** b128cdf (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 type/API incompatibilities — Rule 1 Bug)
**Impact on plan:** Both fixes required for TypeScript strict mode compliance. Behavior equivalent to plan intent: DLQ preservation achieved, retry options available at job-enqueue time.

## Issues Encountered

Pre-existing TypeScript error in `apps/agent/src/multi-agent/sub-agent-tool.ts` (Cannot find module 'zod') — this is from plan 03-02/03-03 and is out of scope for this plan. Deferred.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Retry infrastructure ready for the autonomous planning loop (Phase 03-05)
- `createRetryJobOptions()` should be used in any future job enqueue sites
- `scheduleRecurringTask()` is ready for recurring tasks like market scans or health checks
- No blockers introduced by this plan

---
*Phase: 03-autonomous-loop*
*Completed: 2026-02-18*
