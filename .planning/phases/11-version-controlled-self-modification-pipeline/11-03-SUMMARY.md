---
phase: 11-version-controlled-self-modification-pipeline
plan: 03
subsystem: self-extension
tags: [promotion-gate, merge-guard, status-context, branch-cleanup, docs]
requires:
  - phase: 11-02
    provides: deterministic branch/commit/PR pipeline and sandbox status publication
provides:
  - reusable promotion gate evaluator for required status contexts
  - merge path enforcement with head-sha guard and blocked-state diagnostics
  - updated operator docs for PR-backed promotion troubleshooting
affects: [phase-12, builtin-modify, operator-observability]
tech-stack:
  added: []
  patterns:
    - fail-closed promotion gate evaluation before merge
    - promotion result payloads include machine-readable blocked/merge diagnostics
key-files:
  created:
    - packages/tools/src/self-extension/promotion-gate.ts
    - .planning/phases/11-version-controlled-self-modification-pipeline/11-03-SUMMARY.md
  modified:
    - packages/tools/src/self-extension/github-pipeline.ts
    - packages/tools/src/self-extension/staging-deployer.ts
    - packages/tools/src/self-extension/tool-writer.ts
    - packages/tools/src/self-extension/index.ts
    - README.md
key-decisions:
  - "Promotion gate defaults to required context `jarvis/sandbox` and fails closed on missing/pending/failing states."
  - "Merge path uses pull-request head SHA guard and only deletes short-lived branch after successful merge."
  - "Builtin modify responses expose promotionBlocked/blockReasons/mergeError for deterministic operator and agent diagnostics."
patterns-established:
  - "Gate evaluation is reusable via `evaluatePromotionGate` and can be extended with additional required contexts in later phases."
  - "Promotion failures keep PR context intact while returning structured block/merge reason payloads."
requirements-completed: [SEXT-08]
duration: 2 min
completed: 2026-02-19
---

# Phase 11 Plan 03: Promotion gate with status-based merge blocking and cleanup Summary

**Promotion now fails closed unless required status contexts are green, merges are guarded by expected head SHA, and successful promotions clean up short-lived branch artifacts.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-19T23:21:04Z
- **Completed:** 2026-02-19T23:23:01Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Added `promotion-gate.ts` with reusable required-context evaluation and explicit blocked reason mapping.
- Integrated gate evaluation into GitHub pipeline promotion path before merge, including combined-status retrieval, block reporting, and SHA-guarded merge execution.
- Added branch cleanup after successful promotion and structured merge/promotion diagnostics in pipeline outputs.
- Propagated promotion diagnostics through staging adapter and `tool_write` builtin responses (`promotionBlocked`, `blockReasons`, `mergeError`).
- Updated README to document PR-backed promotion lifecycle and troubleshooting for common blocked states.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement reusable promotion gate evaluator for required status contexts** - `a516abf` (feat)
2. **Task 2: Enforce gate checks in merge path with head-sha safety and branch cleanup** - `2355f6e` (feat)
3. **Task 3: Update documentation and operator expectations for PR-backed promotion flow** - `d9af30c` (docs)

**Plan metadata:** pending (created after state/roadmap updates)

## Files Created/Modified
- `packages/tools/src/self-extension/promotion-gate.ts` - Added gate evaluator with blocked-reason classification.
- `packages/tools/src/self-extension/github-pipeline.ts` - Added combined-status gate check, guarded merge, and post-merge branch cleanup.
- `packages/tools/src/self-extension/staging-deployer.ts` - Added promotion result fields to stage result contract.
- `packages/tools/src/self-extension/tool-writer.ts` - Exposed promotion diagnostics in builtin modify payloads.
- `packages/tools/src/self-extension/index.ts` - Exported promotion gate primitives.
- `README.md` - Documented promotion flow and blocked-state troubleshooting.

## Decisions Made
- Merge must be blocked unless required contexts are successful.
- Merge execution must assert expected head SHA to prevent stale promotion.
- Promotion diagnostics must be surfaced directly in tool payloads for autonomous reasoning.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Live GitHub merge gate smoke tests (real status transitions and branch deletion in bound repo) were not run in this environment because they require authenticated repository access and setup-bound credentials.

## User Setup Required

None.

## Next Phase Readiness
- Phase 11 goals are fully implemented: deterministic branch identity, metadata commits, PR/evidence/status flow, and merge-time gating.
- Ready for Phase-level verification and transition to Phase 12 isolated sandbox verification work.

---
*Phase: 11-version-controlled-self-modification-pipeline*
*Completed: 2026-02-19*
