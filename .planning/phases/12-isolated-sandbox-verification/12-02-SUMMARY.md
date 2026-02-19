---
phase: 12-isolated-sandbox-verification
plan: 02
subsystem: self-extension
tags: [isolated-verifier, verification-policy, staging-gate, worktree, fail-closed]
requires:
  - phase: 12-01
    provides: workspace isolation, bounded command runner, and diagnostics primitives
provides:
  - deterministic stage policy for compile, targetedTests, and startupSmoke verification
  - isolated verifier orchestration with worktree lifecycle and typed diagnostics output
  - staging integration that blocks promotion pipeline on verifier failure
affects: [phase-12-plan-03, builtin-modify, promotion-gating]
tech-stack:
  added: []
  patterns:
    - required verification stages execute in isolated worktree with fail-closed semantics
    - staging pipeline invocation only occurs after isolated verifier passes
key-files:
  created:
    - packages/tools/src/self-extension/verification-policy.ts
    - packages/tools/src/self-extension/isolated-verifier.ts
    - .planning/phases/12-isolated-sandbox-verification/12-02-SUMMARY.md
  modified:
    - packages/tools/src/self-extension/staging-deployer.ts
    - packages/tools/src/self-extension/index.ts
key-decisions:
  - "Verification policy always emits required compile/targetedTests/startupSmoke stages and uses fail-closed fallback commands for unknown paths."
  - "Isolated verifier hydrates required node_modules symlinks into ephemeral worktrees to execute policy commands without mutating live checkout."
  - "Staging deployer returns immediately on isolated verifier failure and does not invoke GitHub promotion flow."
patterns-established:
  - "Verification execution state is expressed as typed stage diagnostics and run-level summary evidence."
  - "Promotion gating logic depends on verifier pass/fail before any repository write flow executes."
requirements-completed: [SEXT-09, SEXT-10, SEXT-11]
duration: 4 min
completed: 2026-02-19
---

# Phase 12 Plan 02: Isolated verifier orchestration and staging integration Summary

**Builtin self-modification now runs deterministic compile/test/smoke policy inside isolated worktrees and blocks promotion whenever verification is not fully successful.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-19T23:47:26Z
- **Completed:** 2026-02-19T23:51:23Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Added `verification-policy.ts` to build deterministic required stage plans (`compile`, `targetedTests`, `startupSmoke`) from candidate file path with fail-closed defaults.
- Added `isolated-verifier.ts` orchestration for worktree creation, candidate patching, bounded stage execution, typed diagnostics aggregation, and guaranteed cleanup.
- Integrated isolated verifier into `stageBuiltinChange` so promotion pipeline calls are gated on verifier pass status.
- Added worktree dependency hydration to prevent isolated command failures from missing toolchain binaries in ephemeral workspaces.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement deterministic verification policy for compile, targeted tests, and startup smoke** - `59c540b` (feat)
2. **Task 2: Create isolated verifier orchestrator that executes stage policy inside worktree** - `51f0a71` (feat)
3. **Task 3: Integrate isolated verifier into builtin staging flow and block promotion on verification failure** - `26610cc` (feat)

Additional deviation fix:
- **Blocking fix:** `f975890` (fix) — hydrate worktree `node_modules` links for isolated stage execution.

**Plan metadata:** pending (created after state/roadmap updates)

## Files Created/Modified
- `packages/tools/src/self-extension/verification-policy.ts` - Deterministic stage planning and fail-closed fallback command selection.
- `packages/tools/src/self-extension/isolated-verifier.ts` - Isolated verification orchestration, diagnostics synthesis, cleanup, and dependency hydration.
- `packages/tools/src/self-extension/staging-deployer.ts` - Promotion gate integration via `runIsolatedVerification` and early failure return path.
- `packages/tools/src/self-extension/index.ts` - Export surface updates for new verifier and policy modules.

## Decisions Made
- Required stage policy is fixed to compile/targetedTests/startupSmoke and never silently omits required checks.
- Isolated runs must be executable in ephemeral worktrees, so toolchain dependencies are linked into the worktree before stage execution.
- Staging pipeline invocation is forbidden when verifier outcome is fail/timeout/error.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Isolated worktree commands failed because package toolchain binaries were missing**
- **Found during:** Plan verification smoke for Task 2
- **Issue:** `pnpm --filter @jarvis/tools build` in isolated workspace failed with `tsc: command not found` because worktree package `node_modules` trees were absent.
- **Fix:** Added dependency hydration in isolated verifier to symlink root and package-level `node_modules` into worktree prior to stage execution.
- **Files modified:** `packages/tools/src/self-extension/isolated-verifier.ts`
- **Verification:** `pnpm --filter @jarvis/tools build` passed and isolated compile/targeted stages executed successfully afterward.
- **Committed in:** `f975890` (fix)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep; fix was required for isolated execution correctness and deterministic verifier behavior.

## Issues Encountered
- Startup smoke stage currently uses a conservative build-level surrogate and failed in local smoke verification, which correctly triggered fail-closed verifier outcome and blocked promotion path.

## User Setup Required

None.

## Next Phase Readiness
- Isolated verifier and staging integration are now in place and enforcing required-stage gating semantics.
- Phase 12 Plan 03 can now implement dedicated startup smoke mode and richer diagnostics surfacing in builtin modify responses.

---
*Phase: 12-isolated-sandbox-verification*
*Completed: 2026-02-19*
