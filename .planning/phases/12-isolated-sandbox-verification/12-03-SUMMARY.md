---
phase: 12-isolated-sandbox-verification
plan: 03
subsystem: self-extension
tags: [startup-smoke, builtin-modify, diagnostics-payload, fail-closed, operator-docs]
requires:
  - phase: 12-02
    provides: isolated verifier orchestration and staging gate integration
provides:
  - deterministic agent startup smoke mode and script usable by isolated verifier stage
  - structured verification outcome fields surfaced in builtin modify responses
  - operator documentation for verifier stage behavior and diagnostics troubleshooting
affects: [phase-12-verification, phase-13-observability, builtin-modify]
tech-stack:
  added: []
  patterns:
    - startup smoke command is bounded, explicit, and reusable from isolated verification
    - builtin modify responses expose machine-readable verification stage and failure metadata
key-files:
  created:
    - .planning/phases/12-isolated-sandbox-verification/12-03-SUMMARY.md
  modified:
    - apps/agent/src/index.ts
    - apps/agent/package.json
    - packages/tools/src/self-extension/isolated-verifier.ts
    - packages/tools/src/self-extension/staging-deployer.ts
    - packages/tools/src/self-extension/tool-writer.ts
    - README.md
key-decisions:
  - "Agent startup smoke mode validates boot wiring and exits deterministically, including explicit resource teardown."
  - "Isolated verifier startup stage executes `@jarvis/agent startup:smoke` and emits startup-specific stage diagnostics."
  - "Builtin modify payloads now include verification overall status, failed stage, failure category/reason, and full diagnostics envelope."
patterns-established:
  - "Verifier pass/fail metadata is available at tool-response level without parsing raw logs."
  - "Startup smoke command self-builds before execution so isolated worktrees without prebuilt dist artifacts can run smoke checks."
requirements-completed: [SEXT-11, SEXT-12]
duration: 9 min
completed: 2026-02-20
---

# Phase 12 Plan 03: Startup smoke mode + structured diagnostic surfacing Summary

**Phase 12 is finalized with deterministic startup smoke execution and machine-readable verifier diagnostics propagated through builtin modify responses and operator docs.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-19T23:55:37Z
- **Completed:** 2026-02-20T00:04:39Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Added startup smoke mode to agent startup path, plus deterministic shutdown cleanup for smoke-only execution.
- Added `startup:smoke` script and wired isolated verifier `startupSmoke` stage to execute it.
- Extended staging/tool response payloads with structured verification fields (`verificationOverallStatus`, `verificationFailedStage`, `verificationFailureCategory`, etc.).
- Updated README with isolated stage sequence, fail-closed behavior, diagnostics fields, and troubleshooting guidance.
- Verified builtin modify smoke harness returns diagnostics fields on both verifier-pass-like and verifier-fail-like flows.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add deterministic startup smoke mode for the agent package** - `65812bf` (feat)
2. **Task 2: Wire startup smoke stage and full diagnostics propagation through verifier and staging** - `aa640c2` (feat)
3. **Task 3: Update operator documentation for Phase 12 verification stages and diagnostics** - `e0f8ae1` (docs)

Additional deviation fixes:
- `9d96192` (fix) — switched smoke command to source execution while debugging dist artifact availability.
- `945c7b5` (fix) — finalized smoke command as self-building (`pnpm build && node dist/index.js --startup-smoke`) for isolated worktree compatibility.

**Plan metadata:** pending (created after state/roadmap updates)

## Files Created/Modified
- `apps/agent/src/index.ts` - Added startup smoke mode detection, smoke wiring checks, and deterministic resource teardown path.
- `apps/agent/package.json` - Added/iterated `startup:smoke` script to support reliable isolated verifier execution.
- `packages/tools/src/self-extension/isolated-verifier.ts` - Routed startup stage to smoke command and preserved diagnostics propagation.
- `packages/tools/src/self-extension/staging-deployer.ts` - Added structured verification outcome fields to staging result contract.
- `packages/tools/src/self-extension/tool-writer.ts` - Surfaced verification fields in builtin modify success/failure payloads.
- `README.md` - Documented isolated verifier stage behavior and diagnostics interpretation/troubleshooting.

## Decisions Made
- Keep startup smoke mode in main agent entrypoint, but short-circuit before long-running runtime loops.
- Include structured verification fields in builtin responses rather than relying on free-form summary text.
- Keep startup smoke stage fail-closed and explicit, even when promotion is blocked upstream by GitHub auth/trust failures.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Startup smoke initially did not terminate due open redis/db handles**
- **Found during:** Task 1 verification (`pnpm --filter @jarvis/agent run startup:smoke`)
- **Issue:** Smoke path returned but process remained alive with open runtime resources.
- **Fix:** Added explicit smoke-mode resource teardown and deterministic process exit behavior.
- **Files modified:** `apps/agent/src/index.ts`
- **Verification:** `startup:smoke` exits cleanly with PASS output.
- **Committed in:** `65812bf`

**2. [Rule 3 - Blocking] Startup smoke command failed in isolated worktrees without prebuilt dist**
- **Found during:** Task 2 builtin smoke harness
- **Issue:** Startup stage attempted to execute missing dist artifact in ephemeral worktree.
- **Fix:** Finalized `startup:smoke` to self-build before executing startup smoke entrypoint.
- **Files modified:** `apps/agent/package.json`
- **Verification:** Isolated verifier startup stage command can execute in clean worktree with staged dependencies.
- **Committed in:** `945c7b5`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Required for deterministic startup smoke behavior and verifier-stage reliability; no scope creep beyond Phase 12 objectives.

## Issues Encountered
- Builtin smoke harness cannot complete GitHub promotion flow in this environment due intentionally invalid mocked token; this is expected and confirms diagnostics survive pipeline-auth failures.

## User Setup Required

None.

## Next Phase Readiness
- Phase 12 requirements are implemented: isolated verification stages now include startup smoke and structured diagnostics are propagated to operators/agent responses.
- Phase 13 can proceed with promotion rollback and observability workflows on top of the completed verifier foundation.

---
*Phase: 12-isolated-sandbox-verification*
*Completed: 2026-02-20*
