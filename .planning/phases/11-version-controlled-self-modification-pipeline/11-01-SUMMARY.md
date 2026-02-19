---
phase: 11-version-controlled-self-modification-pipeline
plan: 01
subsystem: self-extension
tags: [self-extension, execution-context, deterministic-branching, invoke-pipeline, traceability]
requires:
  - phase: 10-03
    provides: trusted GitHub identity/repository binding guardrails for builtin modification
provides:
  - deterministic self-extension execution context and commit metadata envelope
  - deterministic branch naming primitive derived from context plus change fingerprint
  - invoke pipeline support for internal execution context propagation
affects: [phase-11-02, phase-11-03, agent-loop, multi-agent-worker]
tech-stack:
  added: []
  patterns:
    - internal execution-context propagation separated from tool input schemas
    - deterministic metadata serialization and deterministic branch identity
key-files:
  created:
    - packages/tools/src/self-extension/pipeline-context.ts
    - packages/tools/src/self-extension/branch-naming.ts
    - .planning/phases/11-version-controlled-self-modification-pipeline/11-01-SUMMARY.md
  modified:
    - packages/tools/src/self-extension/index.ts
    - packages/tools/src/invoke.ts
    - packages/tools/src/invoke-safe.ts
    - packages/tools/src/types.ts
    - apps/agent/src/loop/agent-loop.ts
    - apps/agent/src/multi-agent/agent-worker.ts
key-decisions:
  - "Execution context must be internal-only metadata and must not alter tool schema validation inputs."
  - "Branch identity must be deterministic from goal/cycle/sub-goal/tool plus change fingerprint, with no timestamp dependence."
  - "Worker execution context may be partially unavailable; nullable identifiers are allowed so metadata propagation remains best-effort without blocking execution."
patterns-established:
  - "Agent loop now forwards cycle log identity into per-tool invocation context."
  - "Sub-agent workers derive context identifiers from scoped job context plus job id fallback."
requirements-completed: [SEXT-05, SEXT-06]
duration: 4 min
completed: 2026-02-19
---

# Phase 11 Plan 01: Execution context propagation + deterministic branch and metadata primitives Summary

**Self-extension now has deterministic execution identity primitives and end-to-end invocation context plumbing from main/sub-agent execution paths into tool invocation internals.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-19T23:05:00Z
- **Completed:** 2026-02-19T23:09:13Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Added reusable self-extension execution context and commit metadata helpers with stable deterministic serialization.
- Added deterministic branch-name generator based on execution context and change fingerprint (toolName/filePath/contentHash).
- Extended invoke plumbing to carry optional internal execution context through kill-check and logging entry points.
- Propagated execution context from both goal loop and sub-agent worker paths, including cycle metadata and tool call identity.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add self-extension execution-context and commit-metadata helpers** - `c2eb93c` (feat)
2. **Task 2: Thread optional execution context through tool invocation functions** - `ac2acb5` (feat)
3. **Task 3: Populate execution context from agent loops and worker paths** - `a8eec30` (feat)

**Plan metadata:** pending (created after state/roadmap updates)

## Files Created/Modified
- `packages/tools/src/self-extension/pipeline-context.ts` - Added context/metadata envelopes and stable serializer.
- `packages/tools/src/self-extension/branch-naming.ts` - Added deterministic branch naming helper with normalized tokens and hash fingerprint.
- `packages/tools/src/self-extension/index.ts` - Exported new self-extension primitives.
- `packages/tools/src/invoke.ts` and `packages/tools/src/invoke-safe.ts` - Added optional internal `executionContext` plumbing.
- `packages/tools/src/types.ts` - Extended tool execute contract with optional internal execution context parameter.
- `apps/agent/src/loop/agent-loop.ts` - Passed cycle/sub-goal/tool execution metadata into tool invocation path.
- `apps/agent/src/multi-agent/agent-worker.ts` - Added best-effort context extraction and metadata propagation for sub-agent tool calls.

## Decisions Made
- Invocation context is explicitly internal and not part of LLM-facing tool schemas.
- Deterministic branch primitives avoid timestamps to support idempotent branch reuse in later GitHub pipeline steps.
- Worker metadata propagation is best-effort with nullable ids rather than hard failure when context is partial.

## Deviations from Plan

**[Rule 3 - Blocking] Extend ToolDefinition execute signature for context propagation** — Found during: Task 2 | Issue: `invokeWithLogging` needed to forward execution metadata into tool execution, but `ToolDefinition.execute` only accepted two parameters and blocked type-safe propagation | Fix: Added optional third `executionContext` parameter to `packages/tools/src/types.ts` | Files modified: `packages/tools/src/types.ts` | Verification: `pnpm build --filter @jarvis/tools` and `pnpm build --filter @jarvis/agent` passed | Commit hash: `ac2acb5`

**Total deviations:** 1 auto-fixed (Rule 3: blocking).
**Impact:** Low risk and required for typed internal metadata plumbing; backward compatibility preserved because the new argument is optional.

## Issues Encountered
- None.

## User Setup Required

None.

## Next Phase Readiness
- Phase 11 Plan 01 primitives are complete and compile-clean.
- Ready for Plan 11-02 GitHub branch/commit/PR orchestration using these deterministic helpers.

---
*Phase: 11-version-controlled-self-modification-pipeline*
*Completed: 2026-02-19*
