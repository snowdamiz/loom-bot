---
phase: 13-promotion-guardrails-rollback-and-visibility
plan: 01
subsystem: self-extension
tags: [lifecycle-events, promotion-control, promotion-guard, audit-trail]
requires: []
provides:
  - append-only self-extension lifecycle event ledger persisted in Postgres
  - persistent promotion pause control state independent from kill switch
  - fail-closed promotion pause checks and lifecycle event emission in staging + promotion flow
affects: [phase-13-rollbacks, phase-13-dashboard-visibility, builtin-modify]
tech-stack:
  added: []
  patterns:
    - append-only self_extension_events table as lifecycle audit source of truth
    - independent promotion control state persisted in agent_state
    - fail-closed promotion pause checks before GitHub mutation and pre-merge
key-files:
  created:
    - .planning/phases/13-promotion-guardrails-rollback-and-visibility/13-01-SUMMARY.md
    - packages/db/src/schema/self-extension-events.ts
    - packages/tools/src/self-extension/lifecycle-events.ts
    - packages/tools/src/self-extension/promotion-control.ts
  modified:
    - packages/db/drizzle.config.ts
    - packages/db/src/schema/index.ts
    - packages/tools/src/self-extension/github-pipeline.ts
    - packages/tools/src/self-extension/index.ts
    - packages/tools/src/self-extension/staging-deployer.ts
key-decisions:
  - "Lifecycle audit events are written through a typed append helper that records run/stage/context/payload metadata per transition."
  - "Promotion pause state is persisted under self_extension:promotion_control and evaluated independently from kill_switch state."
  - "Promotion flow checks pause state before any GitHub mutation and again immediately before merge to close pause-race windows."
patterns-established:
  - "Staging emits proposed/tested/failed lifecycle events tied to a stable lifecycle run id."
  - "Promotion gate and merge failures emit promotion_blocked/failed lifecycle events with deterministic machine-readable reasons."
requirements-completed: [SEXT-14, SEXT-16]
duration: 3 min
completed: 2026-02-20
---

# Phase 13 Plan 01: Append-only lifecycle events + promotion pause guard Summary

**Phase 13 foundation is in place with durable lifecycle auditing and independent fail-closed promotion pause controls wired into builtin self-modification flow.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-20T00:42:27Z
- **Completed:** 2026-02-20T00:45:05Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Added `self_extension_events` append-only schema with deterministic trace metadata (`runId`, `stage`, `eventType`, actor/context references, JSON payload).
- Wired schema exports and Drizzle config so DB build/push flows include lifecycle events table.
- Added reusable self-extension helpers:
  - `getPromotionControlState` / `setPromotionControlState`
  - `appendSelfExtensionEvent`
- Integrated staging lifecycle event emission (`proposed`, `tested`, `failed`) with stable run ids.
- Added independent `promotion-paused` guard before GitHub branch/PR path and again before merge.
- Emitted `promotion_blocked`, `promoted`, and `failed` events across promotion gate and merge transitions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create append-only lifecycle event schema + DB wiring** - `8759f67` (feat)
2. **Task 2: Implement promotion control + lifecycle helper modules** - `bb68b71` (feat)
3. **Task 3: Enforce promotion pause guard + lifecycle event emission in staging/pipeline** - `610d74f` (feat)

## Verification

Executed and passed:
- `pnpm --filter @jarvis/db build`
- `pnpm --filter @jarvis/tools build`
- `rg -n "selfExtensionEvents|append-only|eventType|payload" packages/db/src/schema/self-extension-events.ts`
- `rg -n "self-extension-events" packages/db/src/schema/index.ts packages/db/drizzle.config.ts`
- `rg -n "getPromotionControlState|setPromotionControlState|paused" packages/tools/src/self-extension/promotion-control.ts`
- `rg -n "appendSelfExtensionEvent|promotion_blocked|promotion_pause_changed" packages/tools/src/self-extension/lifecycle-events.ts`
- `rg -n "appendSelfExtensionEvent|promotion-paused|promotion_blocked|promoted" packages/tools/src/self-extension/staging-deployer.ts packages/tools/src/self-extension/github-pipeline.ts`

Not executed in this environment:
- Manual smoke for builtin modify with promotion pause enabled (requires authenticated trusted GitHub setup and runnable builtin modification path).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- Phase 13 Plan 02 can now build baseline/rollback orchestration on top of lifecycle event and promotion control primitives.
- Dashboard/API visibility work in Plan 03 can reuse shared `promotion-control` and `lifecycle-events` modules.

---
*Phase: 13-promotion-guardrails-rollback-and-visibility*
*Completed: 2026-02-20*
