---
phase: 12-isolated-sandbox-verification
plan: 01
subsystem: self-extension
tags: [sandbox-isolation, git-worktree, bounded-execution, diagnostics-contract, verification]
requires:
  - phase: 11-03
    provides: fail-closed promotion gate and branch/PR promotion pipeline
provides:
  - isolated git worktree lifecycle primitives for candidate verification runs
  - bounded subprocess execution primitive with timeout, kill, and output bounds
  - typed verification stage/run diagnostics contracts for downstream verifier orchestration
affects: [phase-12-plan-02, staging-deployer, isolated-verifier]
tech-stack:
  added: []
  patterns:
    - shared bounded subprocess execution for all verifier shell-outs
    - typed stage/run diagnostics derived directly from command execution metadata
key-files:
  created:
    - packages/tools/src/self-extension/workspace-isolation.ts
    - packages/tools/src/self-extension/bounded-command.ts
    - packages/tools/src/self-extension/verification-diagnostics.ts
    - .planning/phases/12-isolated-sandbox-verification/12-01-SUMMARY.md
  modified:
    - packages/tools/src/self-extension/index.ts
key-decisions:
  - "Worktree lifecycle errors are represented via typed WorktreeIsolationError details to classify infra/setup/cleanup failures."
  - "All verifier subprocesses use a shared bounded runner with deterministic pass/fail/timeout/error status semantics."
  - "Verification diagnostics are normalized at stage and run levels via builders from bounded command results."
patterns-established:
  - "Workspace isolation shell-outs are routed through runBoundedCommand instead of ad hoc child_process usage."
  - "Stage diagnostics always include command, cwd, timeout, durationMs, and bounded stdout/stderr telemetry."
requirements-completed: [SEXT-09, SEXT-10, SEXT-12]
duration: 3 min
completed: 2026-02-19
---

# Phase 12 Plan 01: Isolated worktree lifecycle + bounded command + diagnostics primitives Summary

**Phase 12 now has deterministic isolated worktree provisioning, bounded verifier command execution, and typed stage/run diagnostics contracts ready for pipeline integration.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-19T23:40:40Z
- **Completed:** 2026-02-19T23:43:31Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Added reusable `createIsolatedWorktree` and `cleanupIsolatedWorktree` helpers with deterministic temp paths, force cleanup, and prune support.
- Added `runBoundedCommand` to enforce timeout, kill escalation, output tail bounds, and normalized execution status reporting.
- Added `verification-diagnostics` contracts and builders that map bounded command telemetry into machine-readable stage/run outcomes.
- Exported new isolation, bounded execution, and diagnostics primitives from self-extension public index.
- Verified helper behavior with a direct create/cleanup smoke invocation in a local sandbox temp root.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement isolated worktree lifecycle utilities for candidate verification** - `d60387a` (feat)
2. **Task 2: Add bounded subprocess runner with timeout and output limits** - `7e4a9fe` (feat)
3. **Task 3: Define typed verification diagnostics contract and export primitives** - `4758e86` (feat)

**Plan metadata:** pending (created after state/roadmap updates)

## Files Created/Modified
- `packages/tools/src/self-extension/workspace-isolation.ts` - Added isolated git worktree create/cleanup lifecycle with structured failure metadata.
- `packages/tools/src/self-extension/bounded-command.ts` - Added shared bounded child-process runner with timeout/resource/output controls.
- `packages/tools/src/self-extension/verification-diagnostics.ts` - Added typed stage/run diagnostics schema and builders.
- `packages/tools/src/self-extension/index.ts` - Exported bounded command, workspace isolation, and verification diagnostics primitives.

## Decisions Made
- Keep workspace isolation failure details strongly typed so downstream orchestrators can distinguish setup vs infra vs cleanup issues.
- Treat bounded command status as the canonical stage status input for verifier diagnostics.
- Keep diagnostics schema machine-readable with normalized categories (`compile`, `test`, `startup`, `timeout`, `infra`, `setup`, `unknown`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Workspace lifecycle module needed immediate integration with bounded command abstraction**
- **Found during:** Task 2 (bounded subprocess runner)
- **Issue:** Task 1 introduced worktree command execution prior to shared bounded abstraction integration.
- **Fix:** Refactored `workspace-isolation.ts` shell-outs to route through `runBoundedCommand` once Task 2 was implemented.
- **Files modified:** `packages/tools/src/self-extension/workspace-isolation.ts`, `packages/tools/src/self-extension/bounded-command.ts`
- **Verification:** `pnpm --filter @jarvis/tools build` succeeded after refactor.
- **Committed in:** `7e4a9fe` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep; change ensured shell-out policy compliance and improved correctness of Task 1 lifecycle execution.

## Issues Encountered
- `tsx -e` smoke script initially failed because top-level await in CJS eval mode is unsupported; resolved by wrapping smoke script in an async IIFE.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Foundations for SEXT-09/10/12 are complete and exported for orchestration use.
- Phase 12 Plan 02 can now build the isolated verifier pipeline and staging integration on top of these primitives.

---
*Phase: 12-isolated-sandbox-verification*
*Completed: 2026-02-19*
